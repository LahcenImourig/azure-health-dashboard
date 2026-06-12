import type { DashboardSummary, AdvisorRecommendation, AlertRule, RetirementNotice, ServiceHealthEvent } from '@/types/azure';

interface TeamsCard {
  type: string;
  $schema: string;
  version: string;
  body: unknown[];
  actions?: unknown[];
}

function severityColor(count: number, thresholds: [number, number] = [1, 5]): string {
  if (count === 0) return 'good';
  if (count <= thresholds[0]) return 'warning';
  return 'attention';
}

function buildAdaptiveCard(
  summary: DashboardSummary,
  topRecommendations: AdvisorRecommendation[],
  activeAlerts: AlertRule[],
  retirements: RetirementNotice[],
  incidents: ServiceHealthEvent[],
  aiNarrative: string,
  dashboardUrl: string
): TeamsCard {
  const now = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const healthColor = summary.health.criticalIncidents > 0 ? 'attention'
    : summary.health.activeIncidents > 0 ? 'warning' : 'good';

  const costColor = summary.cost.budgetUtilizationPct >= 90 ? 'attention'
    : summary.cost.budgetUtilizationPct >= 75 ? 'warning' : 'good';

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.5',
    body: [
      // Header
      {
        type: 'Container',
        style: 'emphasis',
        items: [
          {
            type: 'ColumnSet',
            columns: [
              {
                type: 'Column',
                width: 'auto',
                items: [{
                  type: 'Image',
                  url: 'https://upload.wikimedia.org/wikipedia/commons/a/a8/Microsoft_Azure_Logo.svg',
                  width: '40px',
                  height: '40px',
                  altText: 'Azure',
                }],
              },
              {
                type: 'Column',
                width: 'stretch',
                items: [
                  { type: 'TextBlock', text: '☁️ Azure Health Daily Report', weight: 'Bolder', size: 'Large', color: 'Accent' },
                  { type: 'TextBlock', text: now, isSubtle: true, spacing: 'None' },
                ],
              },
            ],
          },
        ],
      },
      // AI Narrative
      {
        type: 'Container',
        items: [
          { type: 'TextBlock', text: '🤖 AI Summary', weight: 'Bolder', size: 'Medium' },
          { type: 'TextBlock', text: aiNarrative, wrap: true, isSubtle: false },
        ],
        spacing: 'Medium',
      },
      { type: 'Separator' },
      // KPI row
      {
        type: 'ColumnSet',
        spacing: 'Medium',
        columns: [
          {
            type: 'Column', width: 'stretch',
            style: healthColor,
            items: [
              { type: 'TextBlock', text: '🏥 Health', weight: 'Bolder' },
              { type: 'TextBlock', text: `${summary.health.activeIncidents} incidents`, size: 'ExtraLarge', weight: 'Bolder', color: healthColor === 'good' ? 'Good' : healthColor === 'warning' ? 'Warning' : 'Attention' },
              { type: 'TextBlock', text: `${summary.health.criticalIncidents} critical`, isSubtle: true, spacing: 'None' },
            ],
          },
          {
            type: 'Column', width: 'stretch',
            items: [
              { type: 'TextBlock', text: '💡 Advisor', weight: 'Bolder' },
              { type: 'TextBlock', text: `${summary.advisor.total} tips`, size: 'ExtraLarge', weight: 'Bolder', color: summary.advisor.highImpact > 0 ? 'Warning' : 'Good' },
              { type: 'TextBlock', text: `$${summary.advisor.potentialSavingsUsd.toFixed(0)} savings`, isSubtle: true, spacing: 'None' },
            ],
          },
          {
            type: 'Column', width: 'stretch',
            items: [
              { type: 'TextBlock', text: '💰 Cost', weight: 'Bolder' },
              { type: 'TextBlock', text: `$${summary.cost.currentMonthSpend.toFixed(0)}`, size: 'ExtraLarge', weight: 'Bolder', color: costColor === 'good' ? 'Good' : costColor === 'warning' ? 'Warning' : 'Attention' },
              { type: 'TextBlock', text: `${summary.cost.budgetUtilizationPct.toFixed(0)}% of budget`, isSubtle: true, spacing: 'None' },
            ],
          },
          {
            type: 'Column', width: 'stretch',
            items: [
              { type: 'TextBlock', text: '🔔 Alerts', weight: 'Bolder' },
              { type: 'TextBlock', text: `${summary.alerts.critical + summary.alerts.error}`, size: 'ExtraLarge', weight: 'Bolder', color: summary.alerts.critical > 0 ? 'Attention' : 'Warning' },
              { type: 'TextBlock', text: `${summary.alerts.warning} warnings`, isSubtle: true, spacing: 'None' },
            ],
          },
        ],
      },
      { type: 'Separator' },
      // Active Incidents
      ...(incidents.length > 0 ? [
        { type: 'TextBlock', text: '🚨 Active Incidents', weight: 'Bolder', size: 'Medium', spacing: 'Medium' },
        ...incidents.slice(0, 3).map(i => ({
          type: 'Container',
          style: i.severity === 'Critical' ? 'attention' : 'warning',
          items: [
            { type: 'TextBlock', text: i.title, weight: 'Bolder', wrap: true },
            { type: 'TextBlock', text: `${i.impactedServices.join(', ')} • ${i.impactedRegions.join(', ')}`, isSubtle: true, spacing: 'None', wrap: true },
          ],
          spacing: 'Small',
        })),
      ] : [
        { type: 'TextBlock', text: '✅ No active incidents', color: 'Good', spacing: 'Medium' },
      ]),
      { type: 'Separator' },
      // Top Advisor Recommendations
      { type: 'TextBlock', text: '💡 Top Advisor Recommendations', weight: 'Bolder', size: 'Medium', spacing: 'Medium' },
      ...topRecommendations.slice(0, 5).map(r => ({
        type: 'ColumnSet',
        spacing: 'Small',
        columns: [
          {
            type: 'Column', width: 'auto',
            items: [{ type: 'TextBlock', text: r.impact === 'High' ? '🔴' : r.impact === 'Medium' ? '🟡' : '🟢', size: 'Large' }],
          },
          {
            type: 'Column', width: 'stretch',
            items: [
              { type: 'TextBlock', text: r.title, weight: 'Bolder', wrap: true },
              { type: 'TextBlock', text: `${r.category} • ${r.resourceName}${r.potentialSavingsUsd ? ` • Save $${r.potentialSavingsUsd.toFixed(0)}/mo` : ''}`, isSubtle: true, spacing: 'None', wrap: true },
            ],
          },
        ],
      })),
      // Retirements
      ...(retirements.filter(r => r.daysUntilRetirement <= 90).length > 0 ? [
        { type: 'Separator' },
        { type: 'TextBlock', text: '⚠️ Upcoming Retirements (90 days)', weight: 'Bolder', size: 'Medium', spacing: 'Medium' },
        ...retirements.filter(r => r.daysUntilRetirement <= 90).slice(0, 3).map(r => ({
          type: 'Container',
          style: r.daysUntilRetirement <= 30 ? 'attention' : 'warning',
          items: [
            { type: 'TextBlock', text: r.title, weight: 'Bolder', wrap: true },
            { type: 'TextBlock', text: `Retires in ${r.daysUntilRetirement} days (${new Date(r.retirementDate).toLocaleDateString()})`, isSubtle: true, spacing: 'None' },
          ],
          spacing: 'Small',
        })),
      ] : []),
    ],
    actions: [
      {
        type: 'Action.OpenUrl',
        title: '📊 View Full Dashboard',
        url: dashboardUrl,
        style: 'positive',
      },
      {
        type: 'Action.OpenUrl',
        title: '🏥 Azure Health Portal',
        url: 'https://portal.azure.com/#view/Microsoft_Azure_Health/AzureHealthBrowseBlade/~/serviceIssues',
      },
    ],
  };
}

export async function sendTeamsReport(
  summary: DashboardSummary,
  topRecommendations: AdvisorRecommendation[],
  activeAlerts: AlertRule[],
  retirements: RetirementNotice[],
  incidents: ServiceHealthEvent[],
  aiNarrative: string
): Promise<void> {
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) throw new Error('TEAMS_WEBHOOK_URL is not configured');

  const dashboardUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-dashboard-url.com';

  const card = buildAdaptiveCard(
    summary, topRecommendations, activeAlerts, retirements, incidents, aiNarrative, dashboardUrl
  );

  const payload = {
    type: 'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      contentUrl: null,
      content: card,
    }],
  };

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Teams webhook failed: ${response.status} ${text}`);
  }
}
