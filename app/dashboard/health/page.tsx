'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Activity, RefreshCw, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { SeverityBadge } from '@/components/dashboard/severity-badge';
import { SubscriptionFilter } from '@/components/dashboard/subscription-filter';
import { BackLink } from '@/components/dashboard/back-link';
import { TableSkeleton } from '@/components/dashboard/loading-skeleton';
import { formatDate } from '@/lib/utils';
import type { ServiceHealthEvent } from '@/types/azure';

const TYPE_LABELS: Record<string, string> = {
  Incident: '🔴 Incident',
  PlannedMaintenance: '🔵 Planned Maintenance',
  Informational: 'ℹ️ Informational',
  Security: '🔒 Security',
};

function healthPortalUrl(trackingId: string): string {
  return `https://portal.azure.com/#blade/Microsoft_Azure_Health/AzureHealthBrowseBlade/serviceIssues`;
}

export default function HealthPage() {
  const [subFilter, setSubFilter] = useState('all');

  const { data: rawEvents = [], isLoading, error, refetch, isFetching } = useQuery<ServiceHealthEvent[]>({
    queryKey: ['health'],
    queryFn: async () => { const d = await fetch('/api/azure/health').then(r => r.json()); return Array.isArray(d) ? d : []; },
  });

  // Group duplicate events (same trackingId, different subscriptions) and collect affected subscriptions
  const eventMap = new Map<string, ServiceHealthEvent & { affectedSubscriptions: Array<{ id: string; name: string }> }>();
  for (const e of rawEvents) {
    if (subFilter !== 'all' && e.subscriptionId !== subFilter) continue;
    const key = e.id;
    if (!eventMap.has(key)) {
      eventMap.set(key, { ...e, affectedSubscriptions: [] });
    }
    const entry = eventMap.get(key)!;
    if (e.subscriptionId && e.subscriptionName) {
      const already = entry.affectedSubscriptions.some(s => s.id === e.subscriptionId);
      if (!already) entry.affectedSubscriptions.push({ id: e.subscriptionId!, name: e.subscriptionName! });
    }
  }
  const events = Array.from(eventMap.values());
  const active = events.filter(e => e.status === 'Active');
  const resolved = events.filter(e => e.status === 'Resolved');

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <BackLink />
          <Activity className="h-6 w-6 text-azure-500" />
          <h1 className="text-2xl font-bold">Service Health</h1>
          <button onClick={() => refetch()} disabled={isFetching} className="ml-auto p-2 rounded-md hover:bg-muted text-muted-foreground">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <SubscriptionFilter value={subFilter} onChange={setSubFilter} />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-800 dark:text-red-200">
            Failed to load health data. Check your Azure credentials.
          </div>
        )}

        {isLoading ? <TableSkeleton rows={6} /> : (
          <>
            {active.length === 0 ? (
              <div className="rounded-xl border bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900 p-8 text-center">
                <p className="text-2xl mb-2">✅</p>
                <p className="font-semibold text-green-800 dark:text-green-200">All Azure services are healthy</p>
                <p className="text-sm text-muted-foreground mt-1">No active incidents or degradations</p>
              </div>
            ) : (
              <Section title={`Active Issues (${active.length})`} events={active} />
            )}
            {resolved.length > 0 && <Section title={`Recently Resolved (${resolved.length})`} events={resolved} dimmed />}
          </>
        )}
      </div>
    </div>
  );
}

type EventWithSubs = ServiceHealthEvent & { affectedSubscriptions: Array<{ id: string; name: string }> };

function Section({ title, events, dimmed }: { title: string; events: EventWithSubs[]; dimmed?: boolean }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{title}</h2>
      {events.map(event => <HealthCard key={event.id} event={event} dimmed={dimmed} />)}
    </div>
  );
}

function HealthCard({ event, dimmed }: { event: EventWithSubs; dimmed?: boolean }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`rounded-xl border bg-card shadow-sm ${dimmed ? 'opacity-60' : ''}`}>
      <div className="p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1 min-w-0">
            <h3 className="font-semibold text-foreground">{event.title}</h3>
            <p className="text-xs text-muted-foreground">
              {TYPE_LABELS[event.type] ?? event.type} •{' '}
              Started {formatDate(event.startTime)} •{' '}
              Updated {formatDate(event.lastUpdateTime)}
            </p>
          </div>
          <SeverityBadge severity={event.severity} />
        </div>

        {/* Impacted services */}
        {event.impactedServices.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {event.impactedServices.map(s => (
              <span key={s} className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 text-xs font-medium border border-blue-200 dark:border-blue-800">
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Impacted regions */}
        {event.impactedRegions.length > 0 && (
          <p className="text-xs text-muted-foreground">
            📍 Regions: <span className="font-medium">{event.impactedRegions.join(', ')}</span>
          </p>
        )}

        {/* Affected subscriptions */}
        {event.affectedSubscriptions.length > 0 && (
          <div className="rounded-lg bg-muted/50 border px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground mb-1.5">
              🏷️ Affected subscription{event.affectedSubscriptions.length > 1 ? 's' : ''} ({event.affectedSubscriptions.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {event.affectedSubscriptions.map(sub => (
                <a
                  key={sub.id}
                  href={`https://portal.azure.com/#@/resource/subscriptions/${sub.id}/overview`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-azure-50 dark:bg-azure-950 text-azure-600 dark:text-azure-400 text-xs border border-azure-200 dark:border-azure-800 hover:underline"
                >
                  {sub.name}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Description (collapsible) */}
        {event.description && (
          <>
            <p className={`text-sm text-muted-foreground ${expanded ? '' : 'line-clamp-2'}`}
               dangerouslySetInnerHTML={{ __html: event.description }} />
            {event.description.length > 200 && (
              <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-xs text-azure-500 hover:underline">
                {expanded ? <><ChevronUp className="h-3 w-3" /> Show less</> : <><ChevronDown className="h-3 w-3" /> Show more</>}
              </button>
            )}
          </>
        )}

        <a
          href="https://portal.azure.com/#blade/Microsoft_Azure_Health/AzureHealthBrowseBlade/serviceIssues"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-azure-500 hover:underline"
        >
          View in Azure Portal <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
