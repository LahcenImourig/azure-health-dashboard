'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowLeft, Archive, ExternalLink, RefreshCw, ChevronDown, ChevronUp, Server, FileText } from 'lucide-react';
import { TableSkeleton } from '@/components/dashboard/loading-skeleton';
import { BackLink } from '@/components/dashboard/back-link';
import { formatDate, cn } from '@/lib/utils';
import type { RetirementNotice, AffectedResource } from '@/types/azure';

function urgencyLabel(days: number): { label: string; className: string } {
  if (days <= 30) return { label: 'Urgent', className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' };
  if (days <= 90) return { label: 'Soon', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' };
  return { label: 'Planned', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' };
}

type Criticality = 'all' | 'urgent' | 'soon' | 'planned';

const CRITICALITY_FILTERS: Array<{ key: Criticality; label: string }> = [
  { key: 'all', label: 'Tous' },
  { key: 'urgent', label: '🔴 Urgent (≤30j)' },
  { key: 'soon', label: '🟡 Soon (≤90j)' },
  { key: 'planned', label: '🔵 Planned (>90j)' },
];

export default function RetirementsPage() {
  const [criticality, setCriticality] = useState<Criticality>('all');

  const { data: retirements = [], isLoading, error, refetch, isFetching } = useQuery<RetirementNotice[]>({
    queryKey: ['retirements'],
    queryFn: async () => { const d = await fetch('/api/azure/retirements').then(r => r.json()); return Array.isArray(d) ? d : []; },
  });

  const allUrgent = retirements?.filter(r => r.daysUntilRetirement <= 30) ?? [];
  const allSoon = retirements?.filter(r => r.daysUntilRetirement > 30 && r.daysUntilRetirement <= 90) ?? [];
  const allPlanned = retirements?.filter(r => r.daysUntilRetirement > 90) ?? [];

  const counts = { all: retirements?.length ?? 0, urgent: allUrgent.length, soon: allSoon.length, planned: allPlanned.length };
  const urgent = criticality === 'all' || criticality === 'urgent' ? allUrgent : [];
  const soon = criticality === 'all' || criticality === 'soon' ? allSoon : [];
  const planned = criticality === 'all' || criticality === 'planned' ? allPlanned : [];
  const visibleCount = urgent.length + soon.length + planned.length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <BackLink />
          <Archive className="h-6 w-6 text-azure-500" />
          <h1 className="text-2xl font-bold">Retirements & Deprecations</h1>
          <button onClick={() => refetch()} disabled={isFetching} className="ml-auto p-2 rounded-md hover:bg-muted text-muted-foreground">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-800 dark:text-red-200">
            Failed to load retirement data.
          </div>
        )}

        {/* Criticality filter */}
        {!isLoading && counts.all > 0 && (
          <div className="flex flex-wrap gap-2">
            {CRITICALITY_FILTERS.map(f => (
              <button
                key={f.key}
                onClick={() => setCriticality(f.key)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors border',
                  criticality === f.key
                    ? 'bg-azure-500 text-white border-azure-500'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {f.label} <span className="opacity-70">({counts[f.key]})</span>
              </button>
            ))}
          </div>
        )}

        {isLoading ? <TableSkeleton rows={5} /> : (
          counts.all === 0 ? (
            <div className="rounded-xl border bg-green-50 dark:bg-green-950 border-green-200 p-8 text-center">
              <p className="text-2xl mb-2">✅</p>
              <p className="font-semibold text-green-800 dark:text-green-200">No upcoming retirements found</p>
            </div>
          ) : visibleCount === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-muted-foreground">
              Aucun retrait dans cette catégorie.
            </div>
          ) : (
            <div className="space-y-6">
              {urgent.length > 0 && <RetirementGroup title="🔴 Urgent — within 30 days" items={urgent} />}
              {soon.length > 0 && <RetirementGroup title="🟡 Soon — within 90 days" items={soon} />}
              {planned.length > 0 && <RetirementGroup title="🔵 Planned — beyond 90 days" items={planned} />}
            </div>
          )
        )}
      </div>
    </div>
  );
}

function RetirementGroup({ title, items }: { title: string; items: RetirementNotice[] }) {
  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">{title}</h2>
      {items.map(r => <RetirementCard key={r.id} r={r} />)}
    </div>
  );
}

function RetirementCard({ r }: { r: RetirementNotice }) {
  const [showDetail, setShowDetail] = useState(false);
  const { label, className } = urgencyLabel(r.daysUntilRetirement);
  const resources = r.affectedResources ?? [];
  const subs = r.affectedSubscriptions ?? [];
  const regions = r.regions ?? [];
  const hasResources = resources.length > 0;
  const inferred = r.resourcesInferred === true;
  // Azure scopes most retirement advisories to subscriptions/regions, not individual resources
  const scopeLabel = hasResources
    ? `${resources.length} ressource${resources.length > 1 ? 's' : ''} ${inferred ? 'potentiellement concernée' : 'affectée'}${resources.length > 1 ? 's' : ''}`
    : `${subs.length} souscription${subs.length > 1 ? 's' : ''} concernée${subs.length > 1 ? 's' : ''}`;
  const expandable = hasResources || subs.length > 0;

  return (
    <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
      <div className="p-5 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground">{r.title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Service : <span className="font-medium">{r.service}</span> •{' '}
              Retrait : <span className="font-medium">{formatDate(r.retirementDate)}</span> ({r.daysUntilRetirement} jours)
            </p>
          </div>
          <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-medium shrink-0', className)}>{label}</span>
        </div>

        {r.description && (
          <p className="text-sm text-muted-foreground line-clamp-3">{r.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {r.articleUrl && (
            <a href={r.articleUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-azure-500 hover:underline">
              <FileText className="h-3.5 w-3.5" /> Avis Microsoft <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {r.migrationGuideUrl && r.migrationGuideUrl !== r.articleUrl && (
            <a href={r.migrationGuideUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-azure-500 hover:underline">
              Guide de migration <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {expandable && (
            <button onClick={() => setShowDetail(!showDetail)}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <Server className="h-3.5 w-3.5" />
              {scopeLabel}
              {showDetail ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>

        {/* Regions (when Azure provides a focused set) */}
        {regions.length > 0 && regions.length <= 8 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">📍 Régions :</span>
            {regions.map(reg => (
              <span key={reg} className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{reg}</span>
            ))}
          </div>
        )}
      </div>

      {/* Detail panel */}
      {showDetail && (
        <div className="border-t bg-muted/30 px-5 py-4">
          {hasResources ? (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Ressources {inferred ? 'potentiellement concernées' : 'affectées'} ({resources.length})
              </p>
              {inferred && (
                <p className="text-[11px] text-muted-foreground mb-3">
                  Azure ne liste pas les ressources exactes pour cet avis — voici vos ressources du type concerné. Vérifiez lesquelles sont réellement impactées (ex. SKU, version).
                </p>
              )}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {resources.map((res, i) => <ResourceRow key={res.id ?? i} resource={res} />)}
              </div>
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                Souscriptions concernées ({subs.length})
              </p>
              <p className="text-[11px] text-muted-foreground mb-3">
                Azure n'expose pas la liste des ressources individuelles pour cet avis — il est scopé aux souscriptions ci-dessous.
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {subs.map((s) => (
                  <a key={s.id} href={`https://portal.azure.com/#@/resource/subscriptions/${s.id}/overview`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-between gap-2 rounded-lg bg-card border px-3 py-2 text-sm hover:border-azure-300 dark:hover:border-azure-800 transition-colors">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{s.name}</p>
                      <p className="text-[11px] font-mono text-muted-foreground truncate">{s.id}</p>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-azure-500" />
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ResourceRow({ resource }: { resource: AffectedResource }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-card border px-3 py-2 text-sm">
      <div className="min-w-0">
        <p className="font-medium truncate">{resource.name}</p>
        <p className="text-xs text-muted-foreground truncate">
          {resource.type} · {resource.resourceGroup}
          {resource.subscriptionName && <> · <span className="text-azure-500">{resource.subscriptionName}</span></>}
        </p>
      </div>
      <a
        href={resource.portalUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-azure-500 hover:text-azure-600"
        title="Open in Azure Portal"
      >
        <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}
