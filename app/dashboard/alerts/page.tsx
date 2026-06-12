'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Bell, RefreshCw, ExternalLink, Server } from 'lucide-react';
import { SeverityBadge } from '@/components/dashboard/severity-badge';
import { SubscriptionFilter } from '@/components/dashboard/subscription-filter';
import { BackLink } from '@/components/dashboard/back-link';
import { TableSkeleton } from '@/components/dashboard/loading-skeleton';
import { formatDate, cn } from '@/lib/utils';
import type { AlertRule, Severity } from '@/types/azure';

const SEVERITIES: Array<Severity | 'All'> = ['All', 'Critical', 'Error', 'Warning', 'Informational'];

// Friendly label from Azure resource type string
function friendlyType(resourceType?: string): string {
  if (!resourceType) return '';
  const last = resourceType.split('/').pop() ?? resourceType;
  return last.replace(/([A-Z])/g, ' $1').trim();
}

export default function AlertsPage() {
  const [severityFilter, setSeverityFilter] = useState<Severity | 'All'>('All');
  const [subFilter, setSubFilter] = useState('all');

  const { data: alerts = [], isLoading, error, refetch, isFetching } = useQuery<AlertRule[]>({
    queryKey: ['alerts'],
    queryFn: async () => { const d = await fetch('/api/azure/alerts').then(r => r.json()); return Array.isArray(d) ? d : []; },
  });

  const filtered = (alerts ?? []).filter(a =>
    (severityFilter === 'All' || a.severity === severityFilter) &&
    (subFilter === 'all' || a.subscriptionId === subFilter)
  );

  const counts = {
    Critical: (alerts ?? []).filter(a => a.severity === 'Critical').length,
    Error: (alerts ?? []).filter(a => a.severity === 'Error').length,
    Warning: (alerts ?? []).filter(a => a.severity === 'Warning').length,
    Informational: (alerts ?? []).filter(a => a.severity === 'Informational').length,
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <BackLink />
          <Bell className="h-6 w-6 text-azure-500" />
          <h1 className="text-2xl font-bold">Alerts & Warnings</h1>
          <button onClick={() => refetch()} disabled={isFetching} className="ml-auto p-2 rounded-md hover:bg-muted text-muted-foreground">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <SubscriptionFilter value={subFilter} onChange={setSubFilter} />

        {alerts && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(counts).map(([severity, count]) => (
              <button
                key={severity}
                onClick={() => setSeverityFilter(severityFilter === severity ? 'All' : severity as Severity)}
                className={cn(
                  'rounded-xl border p-4 text-left shadow-sm transition-all hover:shadow-md',
                  severityFilter === severity ? 'ring-2 ring-azure-500' : '',
                  severity === 'Critical' ? 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900' :
                  severity === 'Error' ? 'bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-900' :
                  severity === 'Warning' ? 'bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-900' :
                  'bg-card'
                )}
              >
                <p className="text-xs font-medium text-muted-foreground">{severity}</p>
                <p className="text-3xl font-bold mt-1">{count}</p>
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {SEVERITIES.map(s => (
            <button
              key={s}
              onClick={() => setSeverityFilter(s)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                severityFilter === s
                  ? 'bg-azure-500 text-white border-azure-500'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {s} {s !== 'All' && `(${counts[s as Severity] ?? 0})`}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-800 dark:text-red-200">
            Failed to load alerts.
          </div>
        )}

        {isLoading ? <TableSkeleton rows={6} /> : (
          filtered.length === 0 ? (
            <div className="rounded-xl border bg-green-50 dark:bg-green-950 border-green-200 p-8 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="font-semibold text-green-800 dark:text-green-200">
                {severityFilter === 'All' ? 'No active alerts' : `No ${severityFilter} alerts`}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(alert => (
                <div key={alert.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <div className="p-5 space-y-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-semibold text-foreground">{alert.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {alert.monitorService} •{' '}
                          Fired {formatDate(alert.firedTime)}
                          {alert.subscriptionName && (
                            <> · <span className="text-azure-500">{alert.subscriptionName}</span></>
                          )}
                        </p>
                      </div>
                      <SeverityBadge severity={alert.severity} />
                    </div>

                    {alert.description && (
                      <p className="text-sm text-muted-foreground">{alert.description}</p>
                    )}

                    {/* Affected resource */}
                    {(alert.resourceName && alert.resourceName !== 'Unknown') && (
                      <div className="rounded-lg bg-muted/40 border px-3 py-2.5 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{alert.resourceName}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {alert.resourceType && (
                                <>{friendlyType(alert.resourceType)} · </>
                              )}
                              {alert.resourceGroup && alert.resourceGroup !== 'Unknown' && (
                                <span className="font-medium">{alert.resourceGroup}</span>
                              )}
                            </p>
                          </div>
                        </div>
                        {alert.portalUrl ? (
                          <a
                            href={alert.portalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-azure-500 hover:text-azure-600"
                            title="Open resource in Azure Portal"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        ) : (
                          <a
                            href={`https://portal.azure.com/#blade/Microsoft_Azure_Monitoring/AlertsManagementSummaryBlade`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-azure-500 hover:text-azure-600"
                            title="View in Azure Monitor"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
