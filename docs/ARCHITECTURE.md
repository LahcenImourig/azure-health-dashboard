# Architecture Technique — Azure Health Dashboard

## 1. Vue d'ensemble

Azure Health Dashboard est une application web qui collecte les données opérationnelles d'un tenant Azure (santé, coûts, recommandations, alertes, retraits) et les fait analyser par Claude (Anthropic) via Amazon Bedrock pour produire des insights IA actionnables.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UTILISATEUR                                   │
│                    (Navigateur + SSO Azure AD)                        │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     AWS App Runner                                    │
│              (Next.js 14 — conteneur Docker)                         │
│                                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
│  │ Pages    │  │ API      │  │ Auth     │  │ AI (Bedrock)     │   │
│  │ React   │  │ Routes   │  │ NextAuth │  │ Chat + Insights  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘   │
└────────┬───────────────┬───────────────┬───────────────┬───────────┘
         │               │               │               │
         ▼               ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Azure APIs   │ │ Secrets Mgr  │ │ Azure AD     │ │ Amazon       │
│ (SDK)        │ │ (runtime)    │ │ (OAuth/SSO)  │ │ Bedrock      │
│              │ │              │ │              │ │ (Claude)     │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

## 2. Stack Technique

| Couche | Technologie |
|--------|-------------|
| Frontend | React 18, Tailwind CSS, Recharts, Lucide Icons |
| Framework | Next.js 14 (App Router, standalone output) |
| State Management | TanStack React Query (cache 5 min) |
| Auth | NextAuth.js v4 + Azure AD (Entra ID) provider |
| Backend | Next.js API Routes (serverless-style dans le conteneur) |
| IA | Anthropic Claude via Amazon Bedrock SDK (`@anthropic-ai/bedrock-sdk`) |
| Données Azure | Azure SDK (@azure/identity, arm-advisor, arm-costmanagement, arm-resourcehealth, arm-resourcegraph, arm-subscriptions, monitor-query) |
| Conteneur | Docker (Node 20-alpine, multi-stage, non-root) |
| Hébergement | AWS App Runner (1 vCPU, 2 GB, autoscale 1→3) |
| Secrets | AWS Secrets Manager |
| CI/CD | GitHub Actions (build → push ECR → deploy App Runner) |
| Cron | EventBridge Scheduler + Lambda (rapport quotidien 7h Paris) |
| Monitoring | CloudWatch Logs + Alarme 5xx |

## 3. Architecture AWS

### 3.1 Composants déployés

| Service AWS | Ressource | Rôle |
|-------------|-----------|------|
| ECR | `azure-health-dashboard` | Stockage images Docker |
| App Runner | `azure-health-dashboard` | Hébergement app (HTTPS, autoscaling) |
| Secrets Manager | `azure-health-dashboard/secrets` | Secrets runtime (Azure SP, NextAuth, Teams, Cron) |
| Lambda | `azure-health-dashboard-daily-report` | Déclenche le rapport quotidien |
| EventBridge Scheduler | `azure-health-dashboard-daily-report` | Cron 7h (Europe/Paris) |
| CloudWatch | Alarme `azure-health-dashboard-5xx-errors` | Alerte si >10 erreurs 5xx en 10 min |
| IAM | 4 rôles | Permissions Bedrock, ECR, Secrets, Lambda |

### 3.2 Rôles IAM

| Rôle | Trust | Permissions |
|------|-------|-------------|
| `*-instance-role` | `tasks.apprunner.amazonaws.com` | Bedrock InvokeModel, Secrets GetSecretValue, CloudWatch Logs |
| `*-access-role` | `build.apprunner.amazonaws.com` | ECR Pull (AWSAppRunnerServicePolicyForECRAccess) |
| `*-lambda-role` | `lambda.amazonaws.com` | CloudWatch Logs, Secrets GetSecretValue |
| `*-scheduler-role` | `scheduler.amazonaws.com` | Lambda InvokeFunction |

### 3.3 Flux réseau

```
Internet → App Runner (HTTPS/443) → Container (port 3000)
                                   → Azure APIs (outbound HTTPS)
                                   → Bedrock (outbound HTTPS, us-east-1)
                                   → Secrets Manager (outbound HTTPS)

EventBridge → Lambda → App Runner (HTTPS POST /api/report/generate)
```

## 4. Architecture Applicative

### 4.1 Structure des fichiers

```
├── app/
│   ├── api/
│   │   ├── ai/         → chat (streaming SSE), insights, query (NL→KQL)
│   │   ├── auth/       → NextAuth callbacks
│   │   ├── azure/      → health, retirements, advisor, cost, alerts
│   │   ├── remediation/→ actions de remédiation (désactivé en prod)
│   │   ├── report/     → génération rapport Teams
│   │   └── health/     → endpoint health check (App Runner)
│   ├── auth/signin/    → page login (server + client component)
│   └── dashboard/      → pages principales (overview, health, cost, etc.)
├── components/dashboard/ → composants réutilisables (StatCard, Navbar, etc.)
├── lib/
│   ├── ai-client.ts    → abstraction Bedrock/Anthropic API
│   ├── ai-insights.ts  → génération insights IA (prompt + parsing Zod)
│   ├── ai-report.ts    → génération rapport Teams
│   ├── auth-guard.ts   → middleware d'authentification API
│   ├── azure-client.ts → clients Azure SDK + Resource Graph
│   ├── remediation.ts  → actions de remédiation
│   └── teams-webhook.ts→ envoi webhook Microsoft Teams
├── types/azure.ts      → types TypeScript pour les données Azure
├── scripts/start.sh    → script démarrage conteneur (secrets + Next.js)
├── infra/              → CDK stack (IaC)
└── .github/workflows/  → CI/CD GitHub Actions
```

### 4.2 Flux de données

#### Collecte Azure (API Routes)
```
Browser → /api/azure/* → Azure SDK → Azure Resource Manager APIs
                                    → Azure Resource Graph (inventaire)
                                    → Azure Cost Management
                                    → Azure Advisor
                                    → Azure Service Health
                                    → Azure Monitor (alertes)
```

#### IA Insights
```
Browser → /api/ai/insights → Collecte snapshot tenant (toutes les APIs Azure)
                           → Construction prompt (buildSnapshot)
                           → Appel Bedrock (Claude)
                           → Parsing réponse (Zod, nullable-tolerant)
                           → Retour JSON structuré
```

#### Chat IA (streaming)
```
Browser → /api/ai/chat → Collecte snapshot tenant
                       → Query Resource Graph (inventaire VMs, types)
                       → Construction contexte (snapshot + inventaire)
                       → Stream Bedrock (Claude, SSE)
                       → Réponse en temps réel
```

#### Rapport quotidien
```
EventBridge (7h Paris) → Lambda → POST /api/report/generate (Bearer token)
                                → App collecte données + génère analyse IA
                                → Envoi webhook Microsoft Teams
```

### 4.3 Authentification

```
1. User accède à /dashboard
2. NextAuth middleware → redirect /auth/signin
3. User clique "Sign in with Microsoft"
4. Redirect vers Azure AD (OAuth 2.0 Authorization Code Flow)
5. Azure AD authentifie + consent
6. Callback /api/auth/callback/azure-ad
7. NextAuth crée JWT (chiffré avec NEXTAUTH_SECRET)
8. Cookie session → accès autorisé
```

### 4.4 Sécurité

| Aspect | Implémentation |
|--------|---------------|
| Auth utilisateur | Azure AD SSO (JWT, cookie httpOnly) |
| Auth API interne | `requireAuth()` sur toutes les routes API |
| Auth cron Lambda | Bearer token (CRON_SECRET) |
| Secrets | Secrets Manager (jamais en env var sauf pour contournement App Runner) |
| Azure SP | ClientSecretCredential (rôle Reader sur Management Group) |
| Bedrock | IAM role (pas de clé API) |
| Conteneur | Utilisateur non-root (uid 1001) |
| Réseau | HTTPS uniquement (TLS managé par App Runner) |
| Remédiation | Désactivée par défaut (REMEDIATION_ENABLED=false) |

## 5. Modèle IA

### 5.1 Provider
- **Production** : Amazon Bedrock (region us-east-1)
- **Modèle** : `us.anthropic.claude-sonnet-4-5-20250929-v1:0` (inference profile cross-region)
- **Fallback** : Mode dégradé (analyse déterministe sans IA)

### 5.2 Fonctionnalités IA
| Feature | Endpoint | Mode |
|---------|----------|------|
| Insights tenant | `/api/ai/insights` | Requête synchrone, JSON structuré |
| Chat conversationnel | `/api/ai/chat` | Streaming SSE |
| NL → KQL | `/api/ai/query` | Requête synchrone |
| Rapport Teams | `/api/report/generate` | Synchrone, envoi webhook |

### 5.3 Contexte du chat
À chaque message, le chat enrichit le contexte avec :
1. Snapshot tenant (health, cost, alerts, advisor, retirements)
2. Inventaire Resource Graph (types de ressources, liste VMs avec tags)
3. Historique des 12 derniers messages

## 6. Performance & Cache

| Couche | Stratégie |
|--------|-----------|
| Client (React Query) | staleTime: 5 min, gcTime: 10 min, refetchOnWindowFocus: false |
| Navigation SPA | Données conservées en cache entre les pages |
| Refresh manuel | Bouton par section + "Refresh all" |
| API Routes | Pas de cache serveur (données fraîches à chaque appel API Azure) |

## 7. Monitoring & Observabilité

- **Logs applicatifs** : CloudWatch Logs (via App Runner automatique)
- **Alarme** : 5xx > 10 en 10 min → CloudWatch Alarm
- **Health check** : GET /api/health (retourne 200, vérifié toutes les 10s)
- **Métriques App Runner** : CPU, mémoire, latence, 2xx/4xx/5xx (console AWS)

## 8. Déploiement

### Pipeline CI/CD
```
git push main → GitHub Actions → docker build → ECR push → App Runner start-deployment
```

### Déploiement manuel
```bash
git pull && docker build -t <ECR_URI>:latest . && docker push <ECR_URI>:latest
aws apprunner start-deployment --service-arn <ARN>
```

### Variables d'environnement (App Runner)
| Variable | Valeur |
|----------|--------|
| AI_PROVIDER | bedrock |
| AWS_REGION | us-east-1 |
| BEDROCK_MODEL_ID | us.anthropic.claude-sonnet-4-5-20250929-v1:0 |
| AZURE_TENANT_ID | (tenant Azure) |
| AZURE_CLIENT_ID | (app registration ID) |
| NEXTAUTH_URL | https://tvsukwck3x.us-east-1.awsapprunner.com |
| NODE_ENV | production |
| REMEDIATION_ENABLED | false |

### Secrets (directement en env vars App Runner pour cette V1)
- AZURE_CLIENT_SECRET
- AZURE_AD_CLIENT_SECRET
- NEXTAUTH_SECRET
- TEAMS_WEBHOOK_URL (dans Secrets Manager)
- CRON_SECRET (dans Secrets Manager)

## 9. Limitations V1

- Pas de WAF/firewall applicatif
- Secrets en env vars App Runner (pas injectés depuis Secrets Manager au runtime — le script start.sh est préparé mais non fonctionnel)
- Pas de domaine custom (URL App Runner auto-générée)
- Pas de backup/DR
- Remédiation Azure désactivée
- Pas de tests automatisés dans le pipeline CI/CD

## 10. Évolutions prévues

1. Injection des secrets depuis Secrets Manager au runtime (fix start.sh)
2. Domaine custom + certificat ACM
3. WAF pour protection DDoS/bot
4. Tests E2E dans le pipeline
5. Activation de la remédiation Azure (avec approval workflow)
6. Multi-tenant (plusieurs organisations)
7. Export PDF des rapports
8. Intégration ServiceNow/Jira pour les actions
