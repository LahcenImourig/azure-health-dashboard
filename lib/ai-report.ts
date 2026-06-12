import { getAIClient, isAIConfigured, resolveModel } from '@/lib/ai-client';
import type { DashboardSummary, AdvisorRecommendation, AlertRule, RetirementNotice, ServiceHealthEvent } from '@/types/azure';

function buildPrompt(
  summary: DashboardSummary,
  incidents: ServiceHealthEvent[],
  retirements: RetirementNotice[],
  recommendations: AdvisorRecommendation[],
  alerts: AlertRule[],
  subscriptionCount?: number
): string {
  return `You are an Azure cloud operations expert generating a concise daily health report for a Microsoft Teams channel.

Today's date: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
Tenant scope: ${subscriptionCount ? `${subscriptionCount} subscriptions` : 'all subscriptions'}

## Current Azure Tenant Status

### Service Health
- Active incidents: ${summary.health.activeIncidents} (${summary.health.criticalIncidents} critical)
- Planned maintenance: ${summary.health.plannedMaintenance}
${incidents.length > 0 ? `\nTop incidents:\n${incidents.slice(0, 3).map(i => `- [${i.severity}] ${i.title} (${i.impactedServices.join(', ')})`).join('\n')}` : '- No active incidents ✅'}

### Cost Analysis
- Current month spend: $${summary.cost.currentMonthSpend.toFixed(2)} ${summary.cost.currency}
- Budget utilization: ${summary.cost.budgetUtilizationPct.toFixed(1)}%

### Azure Advisor
- Total recommendations: ${summary.advisor.total} (${summary.advisor.highImpact} high impact)
- Potential monthly savings: $${summary.advisor.potentialSavingsUsd.toFixed(2)}
${recommendations.slice(0, 5).map(r => `- [${r.impact}][${r.category}] ${r.title}`).join('\n')}

### Active Alerts
- Critical: ${summary.alerts.critical}, Error: ${summary.alerts.error}, Warning: ${summary.alerts.warning}
${alerts.slice(0, 3).map(a => `- [${a.severity}] ${a.name} (${a.resourceName})`).join('\n')}

### Upcoming Retirements (next 90 days)
${retirements.filter(r => r.daysUntilRetirement <= 90).slice(0, 5).map(r => `- ${r.title} — retires in ${r.daysUntilRetirement} days`).join('\n') || 'None'}

## Instructions
Write a 3-4 sentence executive summary for the Teams message. Be direct and actionable. Highlight:
1. Overall health status (is anything critical happening?)
2. Most urgent action items (highest priority issues to address today)
3. Cost situation (on track, approaching budget, or over budget?)
4. One sentence on what the team should focus on today

Keep it professional but conversational. No bullet points — flowing prose. Max 80 words.`;
}

export async function generateAIReport(
  summary: DashboardSummary,
  incidents: ServiceHealthEvent[],
  retirements: RetirementNotice[],
  recommendations: AdvisorRecommendation[],
  alerts: AlertRule[],
  subscriptionCount?: number
): Promise<string> {
  if (!isAIConfigured()) {
    return buildFallbackNarrative(summary, incidents);
  }

  const client = getAIClient();
  const prompt = buildPrompt(summary, incidents, retirements, recommendations, alerts, subscriptionCount);

  const message = await client.messages.create({
    model: resolveModel(),
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  });

  const content = message.content[0];
  if (content.type !== 'text') throw new Error('Unexpected AI response type');
  return content.text.trim();
}

function buildFallbackNarrative(summary: DashboardSummary, incidents: ServiceHealthEvent[]): string {
  const healthStatus = summary.health.criticalIncidents > 0
    ? `⚠️ ${summary.health.criticalIncidents} critical incident(s) are active and require immediate attention.`
    : summary.health.activeIncidents > 0
    ? `${summary.health.activeIncidents} non-critical incident(s) are being tracked.`
    : 'All Azure services are operating normally.';

  const costStatus = summary.cost.budgetUtilizationPct >= 90
    ? `Budget utilization is at ${summary.cost.budgetUtilizationPct.toFixed(0)}% — approaching limit.`
    : `Current spend is $${summary.cost.currentMonthSpend.toFixed(0)} (${summary.cost.budgetUtilizationPct.toFixed(0)}% of budget).`;

  const advisorStatus = summary.advisor.highImpact > 0
    ? `${summary.advisor.highImpact} high-impact Advisor recommendations are pending with $${summary.advisor.potentialSavingsUsd.toFixed(0)} in potential savings.`
    : 'No high-impact Advisor recommendations pending.';

  return `${healthStatus} ${costStatus} ${advisorStatus}`;
}
