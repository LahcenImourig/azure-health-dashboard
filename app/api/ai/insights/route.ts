import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getAllSubscriptions } from '@/lib/azure-client';
import { generateInsights, type TenantData } from '@/lib/ai-insights';
import type { ServiceHealthEvent, RetirementNotice, AdvisorRecommendation, AlertRule, CostSummary } from '@/types/azure';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

async function fetchInternal<T>(origin: string, path: string, cookie: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${origin}${path}`, { headers: { cookie }, cache: 'no-store' });
    if (!res.ok) return fallback;
    const data = await res.json();
    return (data && typeof data === 'object' && 'error' in data) ? fallback : (data as T);
  } catch {
    return fallback;
  }
}

export async function GET(req: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const origin = new URL(req.url).origin;
    const cookie = req.headers.get('cookie') ?? '';

    const [incidents, retirements, recommendations, alerts, cost, subscriptions] = await Promise.all([
      fetchInternal<ServiceHealthEvent[]>(origin, '/api/azure/health', cookie, []),
      fetchInternal<RetirementNotice[]>(origin, '/api/azure/retirements', cookie, []),
      fetchInternal<AdvisorRecommendation[]>(origin, '/api/azure/advisor', cookie, []),
      fetchInternal<AlertRule[]>(origin, '/api/azure/alerts', cookie, []),
      fetchInternal<CostSummary | null>(origin, '/api/azure/cost', cookie, null),
      getAllSubscriptions(),
    ]);

    const data: TenantData = {
      incidents: Array.isArray(incidents) ? incidents : [],
      retirements: Array.isArray(retirements) ? retirements : [],
      recommendations: Array.isArray(recommendations) ? recommendations : [],
      alerts: Array.isArray(alerts) ? alerts : [],
      cost: cost && typeof cost === 'object' ? cost : null,
      subscriptions: subscriptions.map(s => ({ id: s.id, displayName: s.displayName })),
    };

    const insights = await generateInsights(data);
    return NextResponse.json(insights);
  } catch (error) {
    console.error('AI insights API error:', error);
    return NextResponse.json({ error: 'Failed to generate insights' }, { status: 500 });
  }
}
