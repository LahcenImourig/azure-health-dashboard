import { z } from 'zod';
import { getAIClient, isAIConfigured, resolveModel } from '@/lib/ai-client';
import type {
  ServiceHealthEvent, RetirementNotice, AdvisorRecommendation, AlertRule, CostSummary,
} from '@/types/azure';

// Backward-compatible export (now resolves via the provider abstraction)
export const AI_MODEL = resolveModel();

/* ----------------------------- Output schema ----------------------------- */

// Helper: accept null as empty string
const s = z.string().nullable().transform(v => v ?? '');
const optStr = z.string().nullable().optional().transform(v => v ?? undefined);

const HighlightSchema = z.object({
  icon: z.enum(['incident', 'cost', 'retirement', 'advisor', 'security', 'reliability']),
  text: s,
});

const PriorityActionSchema = z.object({
  rank: z.number(),
  title: s,
  why: s,
  category: z.enum(['cost', 'reliability', 'security', 'retirement', 'incident']),
  impact: s,
  effort: z.enum(['Faible', 'Moyen', 'Élevé']),
  deadline: optStr,
});

const AdvisorClusterSchema = z.object({
  key: s,
  label: s,
  category: z.enum(['Cost', 'Security', 'Reliability', 'Performance', 'OperationalExcellence']),
  count: z.number(),
  savingsUsd: z.number().nullable().optional().transform(v => v ?? undefined),
  topResources: z.array(s),
});

const CostAnomalySchema = z.object({
  resourceGroup: s,
  changePct: z.number(),
  fromUsd: z.number(),
  toUsd: z.number(),
  likelyCause: s,
  detectedOn: s,
});

const CorrelationSchema = z.object({
  id: s,
  title: s,
  diagnosis: s,
  confidence: z.enum(['Élevée', 'Moyenne']),
  signals: z.array(z.object({
    source: z.enum(['Health', 'Alerts', 'Advisor', 'Cost']),
    detail: s,
  })),
  recommendation: s,
});

const RetirementImpactSchema = z.object({
  title: s,
  service: s,
  daysLeft: z.number(),
  affectedCount: z.number(),
  affectedResources: z.array(s),
  effort: s,
});

export const InsightsSchema = z.object({
  healthScore: z.object({
    current: z.number(),
    previous: z.number().nullable(),
    reasoning: s,
    bySubscription: z.array(z.object({ name: s, score: z.number() })),
  }),
  morningBrief: z.object({
    summary: s,
    highlights: z.array(HighlightSchema),
  }),
  priorityActions: z.array(PriorityActionSchema),
  advisorClusters: z.array(AdvisorClusterSchema),
  costAnomalies: z.array(CostAnomalySchema),
  correlations: z.array(CorrelationSchema),
  retirementImpacts: z.array(RetirementImpactSchema),
});

export type Insights = z.infer<typeof InsightsSchema>;

export interface InsightsResponse extends Insights {
  costTrend: Array<{ date: string; cost: number }>;
  generatedAt: string;
  model: string;
  degraded?: boolean;
}

/* --------------------------- Snapshot building ---------------------------- */

export interface TenantData {
  incidents: ServiceHealthEvent[];
  retirements: RetirementNotice[];
  recommendations: AdvisorRecommendation[];
  alerts: AlertRule[];
  cost: CostSummary | null;
  subscriptions: Array<{ id: string; displayName: string }>;
}

// Compact, token-efficient summary of the whole tenant for the model.
export function buildSnapshot(data: TenantData): string {
  const { incidents, retirements, recommendations, alerts, cost, subscriptions } = data;

  // Advisor: pre-aggregate by category + resourceType (so we never send 3000+ rows)
  const advisorGroups = new Map<string, { count: number; savings: number; impacts: Record<string, number>; samples: Set<string> }>();
  for (const r of recommendations) {
    const key = `${r.category}::${friendlyType(r.resourceType)}`;
    const g = advisorGroups.get(key) ?? { count: 0, savings: 0, impacts: {}, samples: new Set<string>() };
    g.count++;
    g.savings += r.potentialSavingsUsd ?? 0;
    g.impacts[r.impact] = (g.impacts[r.impact] ?? 0) + 1;
    if (g.samples.size < 3 && r.resourceName) g.samples.add(r.resourceName);
    advisorGroups.set(key, g);
  }
  const advisorLines = Array.from(advisorGroups.entries())
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 25)
    .map(([key, g]) => {
      const [cat, type] = key.split('::');
      const impacts = Object.entries(g.impacts).map(([k, v]) => `${k}:${v}`).join('/');
      return `- ${cat} | ${type} | count=${g.count} | impacts=${impacts}${g.savings > 0 ? ` | savings=$${Math.round(g.savings)}/mo` : ''} | ex: ${Array.from(g.samples).join(', ')}`;
    }).join('\n');

  // Alerts: counts by severity + top fired
  const alertCounts = countBy(alerts, a => a.severity);
  const topAlerts = alerts.slice(0, 12).map(a => `- [${a.severity}] ${a.name} → ${a.resourceName} (${a.resourceGroup}) [${a.subscriptionName ?? a.subscriptionId ?? '?'}]`).join('\n');

  // Health
  const healthLines = incidents.slice(0, 15).map(i =>
    `- [${i.severity}/${i.status}] ${i.title} | services: ${i.impactedServices.join(', ') || '?'} | regions: ${i.impactedRegions.join(', ') || '?'}`
  ).join('\n');

  // Retirements with affected resources
  const retireLines = retirements.slice(0, 20).map(r =>
    `- ${r.title} | service=${r.service} | ${r.daysUntilRetirement}j | affected=${r.impactedResources}${r.affectedResources?.length ? ` (ex: ${r.affectedResources.slice(0, 4).map(x => x.name).join(', ')})` : ''}`
  ).join('\n');

  // Cost
  let costBlock = 'No cost data available.';
  if (cost) {
    const trend = (cost.dailyCosts ?? []).map(d => `${d.date}:$${Math.round(d.cost)}`).join(' ');
    const topRg = (cost.byResourceGroup ?? []).slice(0, 8).map(r => `${r.resourceGroup}=$${Math.round(r.cost)}`).join(', ');
    const topSvc = (cost.byService ?? []).slice(0, 8).map(s => `${s.service}=$${Math.round(s.cost)}`).join(', ');
    const bySub = (cost.bySubscription ?? []).map(s => `${s.subscriptionName}=$${Math.round(s.cost)}`).join(', ');
    costBlock = [
      `Current month spend: $${Math.round(cost.currentMonthSpend)} ${cost.currency}`,
      `Forecast end-of-month: $${Math.round(cost.forecastedMonthSpend)}`,
      `Budget utilization: ${(cost.budgetUtilizationPct ?? 0).toFixed(0)}%`,
      `Daily trend: ${trend}`,
      `Top resource groups: ${topRg}`,
      `Top services: ${topSvc}`,
      `By subscription: ${bySub}`,
    ].join('\n');
  }

  return `## TENANT SNAPSHOT (${subscriptions.length} subscriptions: ${subscriptions.map(s => s.displayName).join(', ')})

### SERVICE HEALTH (${incidents.length} events, ${incidents.filter(i => i.status === 'Active').length} active)
${healthLines || 'None'}

### RETIREMENTS (${retirements.length} active)
${retireLines || 'None'}

### ADVISOR (${recommendations.length} recommendations, aggregated by category × resource type)
${advisorLines || 'None'}

### ALERTS (${alerts.length} firing — ${Object.entries(alertCounts).map(([k, v]) => `${k}:${v}`).join(', ')})
${topAlerts || 'None'}

### COST
${costBlock}`;
}

/* ----------------------------- Claude call -------------------------------- */

const SYSTEM_PROMPT = `Tu es un expert en opérations cloud Azure. À partir d'un snapshot agrégé d'un tenant Azure (santé, retraits, recommandations Advisor, alertes, coûts), tu produis une analyse priorisée et actionnable en FRANÇAIS pour une équipe IT.

Ton rôle est de transformer le bruit en signal :
- Calculer un score de santé global 0-100 (pondère : incidents actifs et critiques, retraits urgents <30j, recos sécurité fort impact, dépassement budgétaire). Estime un "previous" plausible si non fourni, sinon null.
- Rédiger un brief du matin concis (3-4 phrases, prose fluide) + 3 à 5 highlights courts.
- Sortir le TOP 5 des priorités du jour, croisées entre sources, avec justification métier concrète, impact chiffré quand possible, effort, et deadline si urgente.
- Regrouper les recommandations Advisor en clusters thématiques lisibles (max 8), avec économies agrégées et exemples de ressources.
- Identifier les anomalies de coût (RG dont la conso dérape) avec cause probable.
- Trouver les CORRÉLATIONS cross-sources : relier des signaux isolés (un incident + des alertes + une reco sur les mêmes ressources/régions) en un diagnostic unique.
- Évaluer l'impact réel des retraits sur les ressources de l'inventaire.

Sois précis, factuel, et n'invente pas de ressources qui ne sont pas dans le snapshot. Si une catégorie est vide, renvoie un tableau vide.

Tu DOIS répondre UNIQUEMENT avec un objet JSON valide (aucun texte avant/après, pas de bloc markdown) respectant EXACTEMENT ce schéma :
{
  "healthScore": { "current": number, "previous": number|null, "reasoning": string, "bySubscription": [{ "name": string, "score": number }] },
  "morningBrief": { "summary": string, "highlights": [{ "icon": "incident"|"cost"|"retirement"|"advisor"|"security"|"reliability", "text": string }] },
  "priorityActions": [{ "rank": number, "title": string, "why": string, "category": "cost"|"reliability"|"security"|"retirement"|"incident", "impact": string, "effort": "Faible"|"Moyen"|"Élevé", "deadline": string? }],
  "advisorClusters": [{ "key": string, "label": string, "category": "Cost"|"Security"|"Reliability"|"Performance"|"OperationalExcellence", "count": number, "savingsUsd": number?, "topResources": string[] }],
  "costAnomalies": [{ "resourceGroup": string, "changePct": number, "fromUsd": number, "toUsd": number, "likelyCause": string, "detectedOn": string }],
  "correlations": [{ "id": string, "title": string, "diagnosis": string, "confidence": "Élevée"|"Moyenne", "signals": [{ "source": "Health"|"Alerts"|"Advisor"|"Cost", "detail": string }], "recommendation": string }],
  "retirementImpacts": [{ "title": string, "service": string, "daysLeft": number, "affectedCount": number, "affectedResources": string[], "effort": string }]
}`;

export async function generateInsights(data: TenantData): Promise<InsightsResponse> {
  const costTrend = (data.cost?.dailyCosts ?? []).map(d => ({ date: d.date, cost: Math.round(d.cost) }));

  if (!isAIConfigured()) {
    return { ...buildFallbackInsights(data), costTrend, generatedAt: new Date().toISOString(), model: 'fallback', degraded: true };
  }

  try {
    const client = getAIClient();
    const model = resolveModel();
    const snapshot = buildSnapshot(data);

    const message = await client.messages.create({
      model,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Voici le snapshot du tenant. Analyse-le et renvoie le JSON.\n\n${snapshot}` }],
    });

    const text = message.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('');
    const raw = extractJson(text);
    const result = InsightsSchema.safeParse(raw);

    if (result.success) {
      return { ...result.data, costTrend, generatedAt: new Date().toISOString(), model };
    }

    // Log validation errors but still try to use partial data
    console.warn('AI response Zod validation failed:', JSON.stringify(result.error.issues.slice(0, 5)));
    // Attempt lenient parse: fill missing fields with defaults
    const lenient = {
      healthScore: { current: 100, previous: null, reasoning: '', bySubscription: [] },
      morningBrief: { summary: '', highlights: [] },
      priorityActions: [],
      advisorClusters: [],
      costAnomalies: [],
      correlations: [],
      retirementImpacts: [],
      ...(raw as object),
    };
    const retryResult = InsightsSchema.safeParse(lenient);
    if (retryResult.success) {
      return { ...retryResult.data, costTrend, generatedAt: new Date().toISOString(), model };
    }

    throw new Error(`Zod validation failed: ${result.error.issues.map(i => i.message).join(', ')}`);
  } catch (err) {
    console.error('AI insights generation failed, using fallback:', err);
    return { ...buildFallbackInsights(data), costTrend, generatedAt: new Date().toISOString(), model: 'fallback', degraded: true };
  }
}

/* ------------------------------- Helpers ---------------------------------- */

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Strip ```json fences if present
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : trimmed;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON object found in AI response');
  return JSON.parse(body.slice(start, end + 1));
}

export function friendlyType(resourceType: string): string {
  if (!resourceType) return 'Resource';
  const last = resourceType.split('/').pop() ?? resourceType;
  return last.replace(/([A-Z])/g, ' $1').trim() || resourceType;
}

function countBy<T>(arr: T[], fn: (x: T) => string): Record<string, number> {
  return arr.reduce((acc, x) => { const k = fn(x); acc[k] = (acc[k] ?? 0) + 1; return acc; }, {} as Record<string, number>);
}

/* --------------------------- Deterministic fallback ----------------------- */

function buildFallbackInsights(data: TenantData): Insights {
  const { incidents, retirements, recommendations, alerts, cost, subscriptions } = data;
  const activeIncidents = incidents.filter(i => i.status === 'Active');
  const critical = activeIncidents.filter(i => i.severity === 'Critical').length;
  const urgent = retirements.filter(r => r.daysUntilRetirement <= 30);
  const highImpact = recommendations.filter(r => r.impact === 'High');
  const savings = recommendations.reduce((s, r) => s + (r.potentialSavingsUsd ?? 0), 0);
  const criticalAlerts = alerts.filter(a => a.severity === 'Critical').length;

  // Score: start 100, subtract weighted penalties (each capped so no single axis tanks it)
  let score = 100;
  score -= Math.min(40, critical * 12 + (activeIncidents.length - critical) * 4);
  score -= Math.min(20, urgent.length * 5);
  score -= Math.min(15, highImpact.length * 0.5);
  score -= Math.min(15, criticalAlerts * 3);
  if (cost && (cost.budgetUtilizationPct ?? 0) > 90) score -= 10;
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Advisor clusters by category
  const byCat = new Map<string, { count: number; savings: number; samples: Set<string> }>();
  for (const r of recommendations) {
    const g = byCat.get(r.category) ?? { count: 0, savings: 0, samples: new Set<string>() };
    g.count++; g.savings += r.potentialSavingsUsd ?? 0;
    if (g.samples.size < 3 && r.resourceName) g.samples.add(r.resourceName);
    byCat.set(r.category, g);
  }
  const advisorClusters = Array.from(byCat.entries()).map(([cat, g]) => ({
    key: cat.toLowerCase(),
    label: `${cat} — ${g.count} recommandations`,
    category: cat as 'Cost' | 'Security' | 'Reliability' | 'Performance' | 'OperationalExcellence',
    count: g.count,
    savingsUsd: g.savings > 0 ? Math.round(g.savings) : undefined,
    topResources: Array.from(g.samples),
  })).sort((a, b) => b.count - a.count);

  const highlights: Array<{ icon: 'incident' | 'cost' | 'retirement' | 'advisor' | 'security' | 'reliability'; text: string }> = [];
  if (activeIncidents.length) highlights.push({ icon: 'incident', text: `${activeIncidents.length} incident(s) actif(s)` });
  if (urgent.length) highlights.push({ icon: 'retirement', text: `${urgent.length} retrait(s) sous 30 jours` });
  if (highImpact.length) highlights.push({ icon: 'advisor', text: `${highImpact.length} recos fort impact = $${Math.round(savings)}/mois` });
  if (cost) highlights.push({ icon: 'cost', text: `Budget à ${(cost.budgetUtilizationPct ?? 0).toFixed(0)}%` });

  const retirementImpacts = urgent.slice(0, 6).map(r => ({
    title: r.title,
    service: r.service,
    daysLeft: r.daysUntilRetirement,
    affectedCount: r.impactedResources,
    affectedResources: (r.affectedResources ?? []).slice(0, 4).map(x => x.name),
    effort: 'À évaluer',
  }));

  const priorityActions = [
    ...urgent.slice(0, 2).map((r, i) => ({
      rank: i + 1, title: `Traiter le retrait : ${r.title}`, why: `Expire dans ${r.daysUntilRetirement} jours.`,
      category: 'retirement' as const, impact: `${r.impactedResources} ressources`, effort: 'Moyen' as const,
      deadline: r.daysUntilRetirement <= 7 ? `${r.daysUntilRetirement}j` : undefined,
    })),
    ...highImpact.slice(0, 3).map((r, i) => ({
      rank: urgent.slice(0, 2).length + i + 1, title: r.title, why: r.description || 'Recommandation Advisor fort impact.',
      category: (r.category === 'Cost' ? 'cost' : r.category === 'Security' ? 'security' : 'reliability') as 'cost' | 'security' | 'reliability',
      impact: r.potentialSavingsUsd ? `$${Math.round(r.potentialSavingsUsd)}/mois` : 'Fort impact', effort: 'Moyen' as const,
    })),
  ].slice(0, 5);

  return {
    healthScore: {
      current: score, previous: null,
      reasoning: 'Score calculé localement (IA indisponible).',
      bySubscription: subscriptions.map(s => ({ name: s.displayName, score })),
    },
    morningBrief: {
      summary: `${activeIncidents.length} incident(s) actif(s), ${urgent.length} retrait(s) urgent(s), ${highImpact.length} recommandations Advisor à fort impact (${Math.round(savings)} $/mois d'économies potentielles).`,
      highlights,
    },
    priorityActions,
    advisorClusters,
    costAnomalies: [],
    correlations: [],
    retirementImpacts,
  };
}
