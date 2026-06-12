'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, TrendingUp, RefreshCw, DollarSign, ExternalLink, Server } from 'lucide-react';
import { TableSkeleton } from '@/components/dashboard/loading-skeleton';
import { SubscriptionFilter } from '@/components/dashboard/subscription-filter';
import { BackLink } from '@/components/dashboard/back-link';
import { formatCurrency, cn } from '@/lib/utils';
import type { AdvisorRecommendation, AdvisorCategory } from '@/types/azure';

const CATEGORIES: Array<AdvisorCategory | 'All'> = ['All', 'Cost', 'Security', 'Reliability', 'Performance', 'OperationalExcellence'];
const CATEGORY_ICONS: Record<string, string> = {
  Cost: '💰', Security: '🔒', Reliability: '🛡️', Performance: '⚡', OperationalExcellence: '⚙️',
};
const IMPACT_STYLES = {
  High: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  Medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  Low: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

// Friendly display name for Azure resource type
function friendlyType(resourceType: string): string {
  const last = resourceType.split('/').pop() ?? resourceType;
  return last.replace(/([A-Z])/g, ' $1').trim();
}

export default function AdvisorPage() {
  const [categoryFilter, setCategoryFilter] = useState<AdvisorCategory | 'All'>('All');
  const [subFilter, setSubFilter] = useState('all');

  const { data: recommendations = [], isLoading, error, refetch, isFetching } = useQuery<AdvisorRecommendation[]>({
    queryKey: ['advisor'],
    queryFn: async () => { const d = await fetch('/api/azure/advisor').then(r => r.json()); return Array.isArray(d) ? d : []; },
  });

  const filtered = (recommendations ?? []).filter(r =>
    (categoryFilter === 'All' || r.category === categoryFilter) &&
    (subFilter === 'all' || r.subscriptionId === subFilter)
  );

  const totalSavings = filtered.reduce((s, r) => s + (r.potentialSavingsUsd ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <BackLink />
          <TrendingUp className="h-6 w-6 text-azure-500" />
          <h1 className="text-2xl font-bold">Azure Advisor</h1>
          <button onClick={() => refetch()} disabled={isFetching} className="ml-auto p-2 rounded-md hover:bg-muted text-muted-foreground">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <SubscriptionFilter value={subFilter} onChange={setSubFilter} />

        {recommendations && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(['High', 'Medium', 'Low'] as const).map(impact => (
              <div key={impact} className="rounded-xl border bg-card p-4 shadow-sm">
                <p className="text-xs font-medium text-muted-foreground">{impact} Impact</p>
                <p className="text-2xl font-bold mt-1">{filtered.filter(r => r.impact === impact).length}</p>
              </div>
            ))}
            <div className="rounded-xl border bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900 p-4 shadow-sm">
              <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5" /> Potential Savings
              </p>
              <p className="text-2xl font-bold mt-1 text-green-700 dark:text-green-300">
                {formatCurrency(totalSavings)}<span className="text-sm font-normal">/mo</span>
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={cn(
                'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                categoryFilter === cat
                  ? 'bg-azure-500 text-white border-azure-500'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              )}
            >
              {cat !== 'All' && CATEGORY_ICONS[cat]} {cat}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-800 dark:text-red-200">
            Failed to load Advisor data.
          </div>
        )}

        {isLoading ? <TableSkeleton rows={6} /> : (
          filtered.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
              No recommendations in this category.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(rec => (
                <div key={rec.id} className="rounded-xl border bg-card shadow-sm overflow-hidden">
                  <div className="p-5 space-y-2.5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-lg shrink-0">{CATEGORY_ICONS[rec.category]}</span>
                          <h3 className="font-semibold text-foreground">{rec.title}</h3>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {rec.potentialSavingsUsd && (
                          <span className="px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs font-medium">
                            Save {formatCurrency(rec.potentialSavingsUsd)}/mo
                          </span>
                        )}
                        <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium', IMPACT_STYLES[rec.impact])}>
                          {rec.impact}
                        </span>
                      </div>
                    </div>

                    {rec.description && <p className="text-sm text-muted-foreground">{rec.description}</p>}

                    {/* Resource details */}
                    <div className="rounded-lg bg-muted/40 border px-3 py-2.5 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{rec.resourceName}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {friendlyType(rec.resourceType)}
                            {rec.resourceGroup && rec.resourceGroup !== 'Unknown' && (
                              <> · <span className="font-medium">{rec.resourceGroup}</span></>
                            )}
                            {rec.subscriptionName && (
                              <> · <span className="text-azure-500">{rec.subscriptionName}</span></>
                            )}
                          </p>
                        </div>
                      </div>
                      {rec.portalUrl && (
                        <a
                          href={rec.portalUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-azure-500 hover:text-azure-600"
                          title="Open resource in Azure Portal"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                    </div>
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
