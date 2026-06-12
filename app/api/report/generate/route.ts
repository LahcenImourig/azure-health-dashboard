import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getServerSession } from 'next-auth';
import { generateAIReport } from '@/lib/ai-report';
import { sendTeamsReport } from '@/lib/teams-webhook';
import type { DashboardSummary, ServiceHealthEvent, RetirementNotice, AdvisorRecommendation, AlertRule } from '@/types/azure';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Cookie: '' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

export async function POST(req: Request) {
  // Allow cron/Lambda calls with a secret token, or authenticated users
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
    // Cron job auth — allowed
  } else {
    const session = await getServerSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const [incidents, retirements, recommendations, cost, alerts] = await Promise.all([
      fetchJson<ServiceHealthEvent[]>('/api/azure/health'),
      fetchJson<RetirementNotice[]>('/api/azure/retirements'),
      fetchJson<AdvisorRecommendation[]>('/api/azure/advisor'),
      fetchJson<{ currentMonthSpend: number; budgetUtilizationPct: number; currency: string; forecastedMonthSpend: number }>('/api/azure/cost'),
      fetchJson<AlertRule[]>('/api/azure/alerts'),
    ]);

    const summary: DashboardSummary = {
      health: {
        activeIncidents: incidents.filter(i => i.status === 'Active').length,
        criticalIncidents: incidents.filter(i => i.status === 'Active' && i.severity === 'Critical').length,
        plannedMaintenance: incidents.filter(i => i.type === 'PlannedMaintenance').length,
      },
      retirements: {
        within30Days: retirements.filter(r => r.daysUntilRetirement <= 30).length,
        within90Days: retirements.filter(r => r.daysUntilRetirement <= 90).length,
        total: retirements.length,
      },
      advisor: {
        highImpact: recommendations.filter(r => r.impact === 'High').length,
        potentialSavingsUsd: recommendations.reduce((sum, r) => sum + (r.potentialSavingsUsd ?? 0), 0),
        total: recommendations.length,
      },
      cost: {
        currentMonthSpend: cost.currentMonthSpend,
        budgetUtilizationPct: cost.budgetUtilizationPct,
        currency: cost.currency,
      },
      alerts: {
        critical: alerts.filter(a => a.severity === 'Critical').length,
        error: alerts.filter(a => a.severity === 'Error').length,
        warning: alerts.filter(a => a.severity === 'Warning').length,
      },
    };

    const narrative = await generateAIReport(summary, incidents, retirements, recommendations, alerts);

    await sendTeamsReport(summary, recommendations, alerts, retirements, incidents, narrative);

    return NextResponse.json({ success: true, narrative, summary });
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Report generation failed' },
      { status: 500 }
    );
  }
}
