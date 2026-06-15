import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getAllSubscriptions, getCostManagementClient, getCredential } from '@/lib/azure-client';
import type { CostSummary, CostByService, CostByResourceGroup, ReservationSummary } from '@/types/azure';

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const subscriptions = await getAllSubscriptions();
    const client = getCostManagementClient();
    const monthlyBudget = parseFloat(process.env.AZURE_MONTHLY_BUDGET_USD ?? '10000');

    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Aggregate across all subscriptions in parallel
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const scope = `/subscriptions/${sub.id}`;
        try {
          const [actualResult, forecastResult, rgResult] = await Promise.all([
            client.query.usage(scope, {
              type: 'ActualCost',
              timeframe: 'Custom',
              timePeriod: { from: firstOfMonth, to: now },
              dataset: {
                granularity: 'Daily',
                aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
                grouping: [{ type: 'Dimension', name: 'ServiceName' }],
              },
            }),
            client.forecast.usage(scope, {
              type: 'ActualCost',
              timeframe: 'Custom',
              timePeriod: { from: now, to: new Date(now.getFullYear(), now.getMonth() + 1, 0) },
              dataset: {
                granularity: 'Daily',
                aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
              },
            }),
            client.query.usage(scope, {
              type: 'ActualCost',
              timeframe: 'Custom',
              timePeriod: { from: firstOfMonth, to: now },
              dataset: {
                granularity: 'None',
                aggregation: { totalCost: { name: 'Cost', function: 'Sum' } },
                grouping: [{ type: 'Dimension', name: 'ResourceGroupName' }],
              },
            }),
          ]);

          return {
            sub,
            actualRows: (actualResult.rows ?? []) as Array<[number, string, number, string, string]>,
            forecastRows: (forecastResult.rows ?? []) as Array<[number, string, number]>,
            rgRows: (rgResult.rows ?? []) as Array<[number, string, string]>,
          };
        } catch (e) {
          console.warn(`Cost fetch failed for ${sub.displayName}:`, e);
          return null;
        }
      })
    );

    // Merge across subscriptions
    const serviceMap = new Map<string, number>();
    const dailyMap = new Map<string, number>();
    const rgMap = new Map<string, number>();
    let currency = 'USD';
    let forecastedExtra = 0;

    for (const result of results) {
      if (result.status !== 'fulfilled' || !result.value) continue;
      const { actualRows, forecastRows, rgRows } = result.value;

      if (actualRows[0]?.[3]) currency = actualRows[0][3];

      for (const [cost, date, , , service] of actualRows) {
        serviceMap.set(service, (serviceMap.get(service) ?? 0) + cost);
        dailyMap.set(date, (dailyMap.get(date) ?? 0) + cost);
      }
      for (const [cost] of forecastRows) forecastedExtra += cost;
      for (const [cost, rg] of rgRows) {
        const key = rg || '(none)';
        rgMap.set(key, (rgMap.get(key) ?? 0) + cost);
      }
    }

    const currentMonthSpend = Array.from(serviceMap.values()).reduce((a, b) => a + b, 0);

    const byService: CostByService[] = Array.from(serviceMap.entries())
      .map(([service, cost]) => ({ service, cost, currency, trend: 0 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10);

    const byResourceGroup: CostByResourceGroup[] = Array.from(rgMap.entries())
      .map(([resourceGroup, cost]) => ({ resourceGroup, cost, currency }))
      .sort((a, b) => b.cost - a.cost);

    const summary: CostSummary = {
      currentMonthSpend,
      forecastedMonthSpend: currentMonthSpend + forecastedExtra,
      monthlyBudget,
      currency,
      budgetUtilizationPct: (currentMonthSpend / monthlyBudget) * 100,
      dailyCosts: Array.from(dailyMap.entries())
        .map(([date, cost]) => ({ date, cost }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      byService,
      byResourceGroup,
      // Per-subscription breakdown
      bySubscription: (results as Array<PromiseFulfilledResult<{
          sub: { id: string; displayName: string };
          actualRows: Array<[number, string, number, string, string]>;
          forecastRows: Array<[number, string, number]>;
          rgRows: Array<[number, string, string]>;
        } | null> | PromiseRejectedResult>)
        .filter((r): r is PromiseFulfilledResult<NonNullable<{
          sub: { id: string; displayName: string };
          actualRows: Array<[number, string, number, string, string]>;
          forecastRows: Array<[number, string, number]>;
          rgRows: Array<[number, string, string]>;
        }>> => r.status === 'fulfilled' && r.value != null)
        .map(r => {
          const v = r.value;
          const spend = v.actualRows.reduce((s, [c]) => s + c, 0);
          return { subscriptionId: v.sub.id, subscriptionName: v.sub.displayName, cost: spend, currency };
        })
        .sort((a, b) => b.cost - a.cost),
    };

    // Fetch reservation utilization
    try {
      const reservations = await fetchReservations(subscriptions.map(s => s.id), firstOfMonth, now, currency);
      summary.reservations = reservations;
    } catch (e) {
      console.warn('Reservation fetch failed (non-blocking):', e);
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Cost API error:', error);
    return NextResponse.json({ error: 'Failed to fetch cost data' }, { status: 500 });
  }
}

async function fetchReservations(
  subscriptionIds: string[],
  from: Date,
  to: Date,
  currency: string
): Promise<ReservationSummary[]> {
  const credential = getCredential();
  const reservations: ReservationSummary[] = [];

  // Use the Consumption API to get reservation usage summaries
  // Scope: billing account or individual subscriptions
  for (const subId of subscriptionIds.slice(0, 5)) {
    try {
      const scope = `/subscriptions/${subId}`;
      const url = `https://management.azure.com${scope}/providers/Microsoft.Consumption/reservationSummaries?api-version=2023-05-01&grain=monthly&$filter=properties/usageDate ge '${from.toISOString().split('T')[0]}' and properties/usageDate le '${to.toISOString().split('T')[0]}'`;

      const token = await credential.getToken('https://management.azure.com/.default');
      if (!token) continue;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token.token}` },
      });

      if (!res.ok) continue;
      const data = await res.json();

      for (const item of data.value ?? []) {
        const props = item.properties ?? {};
        reservations.push({
          reservationId: props.reservationOrderId ?? item.id ?? '',
          reservationName: props.reservationId ?? props.skuName ?? 'Unknown',
          skuName: props.skuName ?? '',
          location: props.region ?? '',
          term: props.term ?? '',
          utilizationPct: (props.avgUtilizationPercentage ?? props.utilizedPercentage ?? 0),
          usedHours: props.usedHours ?? 0,
          totalHours: props.reservedHours ?? 0,
          monthlyCost: props.purchasedQuantity ?? props.totalReservedQuantity ?? 0,
          currency,
          subscriptionName: undefined,
        });
      }
    } catch {
      // Non-blocking, skip subscription
    }
  }

  // Deduplicate by reservationId
  const seen = new Set<string>();
  return reservations.filter(r => {
    if (seen.has(r.reservationId)) return false;
    seen.add(r.reservationId);
    return true;
  });
}
