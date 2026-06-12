# Azure Health Dashboard — Setup Guide

## 1. Azure Service Principal (Tenant-wide, all subscriptions)

The dashboard auto-discovers all enabled subscriptions in your tenant.
Grant the service principal the required roles **at the Management Group or Tenant root** to cover all subscriptions at once.

**PowerShell (recommandé si vous êtes sur Windows) :**

```powershell
# 1. Créer le service principal
az ad sp create-for-rbac --name "azure-health-dashboard" --skip-assignment

# 2. Récupérer l'ID du Management Group racine du tenant
$MgmtGroup = (az account management-group list --query "[0].name" -o tsv)

# 3. Assigner les rôles au niveau Management Group (couvre toutes les subscriptions)
$SpId = "<SP_CLIENT_ID>"

az role assignment create --assignee $SpId --role "Reader" `
  --scope "/providers/Microsoft.Management/managementGroups/$MgmtGroup"

az role assignment create --assignee $SpId --role "Cost Management Reader" `
  --scope "/providers/Microsoft.Management/managementGroups/$MgmtGroup"

az role assignment create --assignee $SpId --role "Monitoring Reader" `
  --scope "/providers/Microsoft.Management/managementGroups/$MgmtGroup"
```

> **Si vous ne utilisez pas de Management Groups**, assignez les rôles sur chaque subscription :
>
> ```powershell
> $SpId = "<SP_CLIENT_ID>"
> $Subs = az account list --query "[?state=='Enabled'].id" -o tsv
>
> foreach ($Sub in $Subs) {
>   az role assignment create --assignee $SpId --role "Reader" --scope "/subscriptions/$Sub"
>   az role assignment create --assignee $SpId --role "Cost Management Reader" --scope "/subscriptions/$Sub"
>   az role assignment create --assignee $SpId --role "Monitoring Reader" --scope "/subscriptions/$Sub"
> }
> ```

Save `clientId`, `clientSecret`, `tenantId` — add to `.env.local`.

---

## 2. Azure AD App Registration (for SSO login)

1. Go to **Azure Portal → App Registrations → New registration**
2. Name: `azure-health-dashboard`
3. Redirect URI: `https://your-url.com/api/auth/callback/azure-ad`
4. Under **Certificates & secrets**, create a client secret
5. Copy Client ID, Secret, and Tenant ID to `.env.local`

---

## 3. Microsoft Teams Incoming Webhook

1. In Teams, go to the channel → **Connectors** → **Incoming Webhook**
2. Name it "Azure Health Bot", copy the webhook URL
3. Add to `.env.local` as `TEAMS_WEBHOOK_URL`

---

## 4. Environment Variables

Copy `.env.example` to `.env.local` and fill in all values:

```bash
cp .env.example .env.local
```

Generate `NEXTAUTH_SECRET`:
```bash
openssl rand -base64 32
```

Generate `CRON_SECRET` (any random string):
```bash
openssl rand -hex 24
```

---

## 5. Local Development

```bash
npm install
npm run dev
# Open http://localhost:3000
```

Test the daily report locally:
```bash
npm run report
```

---

## 6. Deploy to AWS Amplify

```bash
# Push to GitHub, then connect repo in AWS Amplify Console
# Set all env vars in Amplify → App Settings → Environment Variables
# Build command: npm run build
# Output directory: .next
```

Amplify `amplify.yml`:
```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: .next
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - .next/cache/**/*
```

---

## 7. Daily Report — AWS Lambda + EventBridge

```powershell
# Package the Lambda
cd lambda
npm init -y
npm install node-fetch
npx tsc handler.ts --module commonjs --outDir dist

# Zip (nécessite 7-Zip ou la commande Compress-Archive de PowerShell)
Compress-Archive -Path dist\* -DestinationPath function.zip -Force

# Deploy
aws lambda create-function `
  --function-name azure-health-daily-report `
  --runtime nodejs20.x `
  --handler dist/handler.handler `
  --zip-file fileb://function.zip `
  --environment "Variables={DASHBOARD_URL=https://your-url.com,CRON_SECRET=your-secret}"

# Schedule at 7:00 AM UTC daily
aws events put-rule `
  --schedule-expression "cron(0 7 * * ? *)" `
  --name "azure-health-daily-report"
```

---

## 8. Azure Resource Graph API

The dashboard uses Resource Graph for advisor and alerts queries. Ensure the service principal has **Reader** access and the `microsoft.resourcegraph` API provider is registered:

```bash
az provider register --namespace Microsoft.ResourceGraph
```

---

## Azure API Permissions Summary

| API | Required Role |
|-----|---------------|
| Service Health | Reader |
| Advisor | Reader |
| Cost Management | Cost Management Reader |
| Monitor Alerts | Monitoring Reader |
| Resource Graph | Reader |
