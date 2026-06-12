/**
 * Standalone script for triggering the daily AI report.
 * Run via: npm run report
 * Or schedule with node-cron or AWS EventBridge + Lambda.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { generateAIReport } from '../lib/ai-report';
import { sendTeamsReport } from '../lib/teams-webhook';
import { getAdvisorClient, getResourceHealthClient, getCostManagementClient, queryResourceGraph, getSubscriptionId } from '../lib/azure-client';
import type { DashboardSummary, ServiceHealthEvent, RetirementNotice, AdvisorRecommendation, AlertRule, CostSummary } from '../types/azure';

async function fetchHealthEvents(): Promise<ServiceHealthEvent[]> {
  try {
    const client = getResourceHealthClient();
    const emergingIssues = await client.emergingIssues.get('default');
    return (emergingIssues.statusActiveEvents ?? []).map(event => ({
      id: event.trackingId ?? crypto.randomUUID(),
      title: event.title ?? 'Unknown',
      type: 'Incident' as const,
      status: 'Active' as const,
      severity: 'Warning' as const,
      impactedServices: event.impacts?.map(i => i.impactedService ?? '') ?? [],
      impactedRegions: event.impacts?.flatMap(i => i.impactedRegions?.map(r => r.impactedRegion ?? '') ?? []) ?? [],
      startTime: event.startTime?.toISOString() ?? new Date().toISOString(),
      lastUpdateTime: event.lastModifiedTime?.toISOString() ?? new Date().toISOString(),
      description: event.description ?? '',
    }));
  } catch (e) {
    console.warn('Health fetch failed:', e);
    return [];
  }
}

async function fetchAdvisor(): Promise<AdvisorRecommendation[]> {
  try {
    const client = getAdvisorClient();
    const recs: AdvisorRecommendation[] = [];
    for await (const rec of client.recommendations.list()) {
      const parts = (rec.resourceMetadata?.resourceId ?? '').split('/');
      recs.push({
        id: rec.id ?? crypto.randomUUID(),
        category: (rec.category ?? 'OperationalExcellence') as AdvisorRecommendation['category'],
        impact: (rec.impact ?? 'Low') as 'High' | 'Medium' | 'Low',
        title: rec.shortDescription?.solution ?? 'Recommendation',
        description: rec.shortDescription?.problem ?? '',
        resourceGroup: parts[4] ?? 'Unknown',
        resourceType: rec.impactedField ?? 'Unknown',
        resourceName: rec.impactedValue ?? 'Unknown',
        potentialSavingsUsd: rec.extendedProperties?.['savingsAmount'] ? parseFloat(rec.extendedProperties['savingsAmount']) : undefined,
        lastUpdated: rec.lastUpdated?.toISOString() ?? new Date().toISOString(),
      });
    }
    return recs.sort((a, b) => ({ High: 0, Medium: 1, Low: 2 }[a.impact] - { High: 0, Medium: 1, Low: 2 }[b.impact]));
  } catch (e) {
    console.warn('Advisor fetch failed:', e);
    return [];
  }
}

async function fetchCost(): Promise<Pick<CostSummary, 'currentMonthSpend' | 'budgetUtilizationPct' | 'currency'>> {
  try {
    const client = getCostManagementClient();
    const scope = `/subscriptions/${getSubscriptionId()}`;
    const monthlyBudget = parseFloat(process.env.AZURE_MONTHLY_BUDGET_USD ?? '5000');
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const result = await client.query.usage(scope, {
      type: 'ActualCost',
      timeframe: 'Custom',
      timePeriod: { from: firstOfMonth, to: now },
      dataset: {
        granularity: 'None',
        aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
      },
    });

    const rows = (result.rows ?? []) as Array<[number, string]>;
    const spend = rows.reduce((s, [cost]) => s + cost, 0);
    const currency = rows[0]?.[1] ?? 'USD';
    return { currentMonthSpend: spend, currency, budgetUtilizationPct: (spend / monthlyBudget) * 100 };
  } catch (e) {
    console.warn('Cost fetch failed:', e);
    return { currentMonthSpend: 0, currency: 'USD', budgetUtilizationPct: 0 };
  }
}

async function fetchAlerts(): Promise<AlertRule[]> {
  try {
    interface Row { id?: string; name?: string; properties?: { essentials?: { alertRule?: string; severity?: string; targetResourceName?: string; targetResourceGroup?: string; firedDateTime?: string } } }
    const rows = await queryResourceGraph(`
      AlertsManagementResources
      | where type == "microsoft.alertsmanagement/alerts"
      | where properties.essentials.monitorCondition == "Fired"
      | project id, name, properties
      | limit 50
    `) as Row[];

    const SEVERITY_MAP: Record<string, AlertRule['severity']> = { Sev0: 'Critical', Sev1: 'Error', Sev2: 'Warning', Sev3: 'Informational', Sev4: 'Informational' };
    return rows.map(row => ({
      id: row.id ?? crypto.randomUUID(),
      name: row.properties?.essentials?.alertRule ?? row.name ?? 'Unknown',
      severity: SEVERITY_MAP[row.properties?.essentials?.severity ?? 'Sev3'] ?? 'Informational',
      status: 'Fired' as const,
      firedTime: row.properties?.essentials?.firedDateTime ?? new Date().toISOString(),
      resourceGroup: row.properties?.essentials?.targetResourceGroup ?? 'Unknown',
      resourceName: row.properties?.essentials?.targetResourceName ?? 'Unknown',
      description: '',
      monitorService: 'Azure Monitor',
    }));
  } catch (e) {
    console.warn('Alerts fetch failed:', e);
    return [];
  }
}

async function fetchRetirements(): Promise<RetirementNotice[]> {
  try {
    interface Row { id?: string; properties?: { header?: string; services?: string[]; description?: string; retirementDate?: string; impactedResources?: unknown[]; recommendedActions?: Array<{ link?: string }> } }
    const rows = await queryResourceGraph(`
      ServiceHealthResources
      | where type == "microsoft.resourcehealth/events"
      | where properties.EventType == "HealthAdvisory"
      | where properties.IsHIR == "true"
      | project id, properties
      | limit 30
    `) as Row[];

    return rows.map(row => {
      const p = row.properties ?? {};
      const retirementDate = p.retirementDate ?? new Date(Date.now() + 90 * 86400000).toISOString();
      const days = Math.ceil((new Date(retirementDate).getTime() - Date.now()) / 86400000);
      return {
        id: row.id ?? crypto.randomUUID(),
        title: p.header ?? 'Retirement Notice',
        service: (p.services ?? ['Unknown'])[0],
        retirementDate,
        daysUntilRetirement: days,
        impactedResources: p.impactedResources?.length ?? 0,
        description: p.description ?? '',
        migrationGuideUrl: p.recommendedActions?.[0]?.link,
      };
    }).filter(r => r.daysUntilRetirement > 0);
  } catch (e) {
    console.warn('Retirements fetch failed:', e);
    return [];
  }
}

async function run() {
  console.log('🚀 Starting Azure daily report generation…');

  const [incidents, advisor, cost, alerts, retirements] = await Promise.all([
    fetchHealthEvents(),
    fetchAdvisor(),
    fetchCost(),
    fetchAlerts(),
    fetchRetirements(),
  ]);

  const summary: DashboardSummary = {
    health: {
      activeIncidents: incidents.filter(i => i.status === 'Active').length,
      criticalIncidents: incidents.filter(i => i.severity === 'Critical').length,
      plannedMaintenance: incidents.filter(i => i.type === 'PlannedMaintenance').length,
    },
    retirements: {
      within30Days: retirements.filter(r => r.daysUntilRetirement <= 30).length,
      within90Days: retirements.filter(r => r.daysUntilRetirement <= 90).length,
      total: retirements.length,
    },
    advisor: {
      highImpact: advisor.filter(r => r.impact === 'High').length,
      potentialSavingsUsd: advisor.reduce((s, r) => s + (r.potentialSavingsUsd ?? 0), 0),
      total: advisor.length,
    },
    cost,
    alerts: {
      critical: alerts.filter(a => a.severity === 'Critical').length,
      error: alerts.filter(a => a.severity === 'Error').length,
      warning: alerts.filter(a => a.severity === 'Warning').length,
    },
  };

  console.log('📊 Summary:', JSON.stringify(summary, null, 2));
  console.log('🤖 Generating AI narrative…');

  const narrative = await generateAIReport(summary, incidents, retirements, advisor, alerts);
  console.log('📝 Narrative:', narrative);
  console.log('📤 Sending to Teams…');

  await sendTeamsReport(summary, advisor, alerts, retirements, incidents, narrative);
  console.log('✅ Report sent successfully!');
}

run().catch(err => {
  console.error('❌ Report failed:', err);
  process.exit(1);
});
