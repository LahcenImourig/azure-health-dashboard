import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { queryResourceGraph, getAllSubscriptionIds } from '@/lib/azure-client';
import type { ServiceHealthEvent, Severity, HealthEventType } from '@/types/azure';

interface HealthRow {
  id?: string;
  subscriptionId?: string;
  properties?: {
    EventType?: string;
    Status?: string;
    Title?: string;
    Header?: string;
    Summary?: string;
    Description?: string;
    TrackingId?: string;
    Level?: string;
    LastUpdateTime?: number;
    ImpactStartTime?: number;
    Impact?: Array<{
      ImpactedService?: string;
      ImpactedRegions?: Array<{ ImpactedRegion?: string; Status?: string }>;
    }>;
  };
}

// .NET ticks (100ns since 0001-01-01) → ISO string
function ticksToIso(ticks?: number): string {
  if (!ticks) return new Date().toISOString();
  const ms = Math.floor(ticks / 10000) - 62135596800000;
  return new Date(ms).toISOString();
}

const EVENT_TYPE_MAP: Record<string, HealthEventType> = {
  ServiceIssue: 'Incident',
  PlannedMaintenance: 'PlannedMaintenance',
  Security: 'Security',
  HealthAdvisory: 'Informational',
};

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const subscriptionIds = await getAllSubscriptionIds();

    const rows = await queryResourceGraph(`
      ServiceHealthResources
      | where type == 'microsoft.resourcehealth/events'
      | where properties.EventType in ('ServiceIssue', 'PlannedMaintenance', 'Security')
      | order by todatetime(properties.LastUpdateTime) desc
      | limit 100
    `, subscriptionIds) as HealthRow[];

    const seenIds = new Set<string>();
    const events: ServiceHealthEvent[] = [];

    for (const row of rows) {
      const p = row.properties ?? {};
      const trackingId = p.TrackingId ?? row.id ?? crypto.randomUUID();
      if (seenIds.has(trackingId)) continue;
      seenIds.add(trackingId);

      const eventType = p.EventType ?? 'ServiceIssue';
      const status = p.Status === 'Active' ? 'Active' : 'Resolved';

      let severity: Severity = 'Informational';
      if (eventType === 'ServiceIssue') severity = status === 'Active' ? 'Error' : 'Warning';
      else if (eventType === 'PlannedMaintenance') severity = 'Warning';
      else if (eventType === 'Security') severity = 'Critical';

      events.push({
        id: trackingId,
        title: p.Title ?? p.Header ?? 'Service Health Event',
        type: EVENT_TYPE_MAP[eventType] ?? 'Incident',
        status,
        severity,
        impactedServices: p.Impact?.map(i => i.ImpactedService ?? '').filter(Boolean) ?? [],
        impactedRegions: p.Impact?.flatMap(i =>
          (i.ImpactedRegions ?? []).map(r => r.ImpactedRegion ?? '')
        ).filter(Boolean) ?? [],
        startTime: ticksToIso(p.ImpactStartTime),
        lastUpdateTime: ticksToIso(p.LastUpdateTime),
        description: p.Summary ?? p.Description ?? '',
        subscriptionId: row.subscriptionId,
      });
    }

    events.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'Active' ? -1 : 1;
      return new Date(b.lastUpdateTime).getTime() - new Date(a.lastUpdateTime).getTime();
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error('Health API error:', error);
    return NextResponse.json({ error: 'Failed to fetch health data' }, { status: 500 });
  }
}
