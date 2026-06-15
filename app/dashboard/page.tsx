'use client';

import { useSession } from 'next-auth/react';
import { redirect } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Activity, TrendingUp, DollarSign, Bell, Archive, LayoutDashboard, Sparkles, Wrench, RefreshCw } from 'lucide-react';
import { Navbar } from '@/components/dashboard/navbar';
import { StatCard } from '@/components/dashboard/stat-card';
import { StatCardSkeleton } from '@/components/dashboard/loading-skeleton';
import { formatCurrency } from '@/lib/utils';
import type { ServiceHealthEvent, AdvisorRecommendation, CostSummary, AlertRule, RetirementNotice } from '@/types/azure';

const NAV_TABS = [
  { href: '/dashboard/health', label: 'Service Health', icon: Activity },
  { href: '/dashboard/retirements', label: 'Retirements', icon: Archive },
  { href: '/dashboard/advisor', label: 'Advisor', icon: TrendingUp },
  { href: '/dashboard/cost', label: 'Cost Analysis', icon: DollarSign },
  { href: '/dashboard/alerts', label: 'Alerts', icon: Bell },
];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  if (status === 'unauthenticated') redirect('/api/auth/signin');

  async function fetchArray<T>(path: string): Promise<T[]> {
    const res = await fetch(path);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  }

  const CACHE_TIME = 5 * 60 * 1000; // 5 minutes cache

  const { data: incidents = [], refetch: refetchHealth, isFetching: fetchingHealth, isLoading: loadingHealth } = useQuery<ServiceHealthEvent[]>({
    queryKey: ['health'],
    queryFn: () => fetchArray<ServiceHealthEvent>('/api/azure/health'),
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME * 2,
  });

  const { data: retirements = [], refetch: refetchRetirements, isFetching: fetchingRetirements } = useQuery<RetirementNotice[]>({
    queryKey: ['retirements'],
    queryFn: () => fetchArray<RetirementNotice>('/api/azure/retirements'),
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME * 2,
  });

  const { data: recommendations = [], refetch: refetchAdvisor, isFetching: fetchingAdvisor } = useQuery<AdvisorRecommendation[]>({
    queryKey: ['advisor'],
    queryFn: () => fetchArray<AdvisorRecommendation>('/api/azure/advisor'),
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME * 2,
  });

  const { data: cost = null, refetch: refetchCost, isFetching: fetchingCost } = useQuery<CostSummary | null>({
    queryKey: ['cost'],
    queryFn: async () => {
      const res = await fetch('/api/azure/cost');
      const data = await res.json();
      return data && !data.error ? data : null;
    },
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME * 2,
  });

  const { data: alerts = [], refetch: refetchAlerts, isFetching: fetchingAlerts } = useQuery<AlertRule[]>({
    queryKey: ['alerts'],
    queryFn: () => fetchArray<AlertRule>('/api/azure/alerts'),
    staleTime: CACHE_TIME,
    gcTime: CACHE_TIME * 2,
  });

  function handleRefresh() {
    void refetchHealth();
    void refetchRetirements();
    void refetchAdvisor();
    void refetchCost();
    void refetchAlerts();
  }

  const activeIncidents = incidents.filter(i => i.status === 'Active');
  const criticalCount = activeIncidents.filter(i => i.severity === 'Critical').length;
  const criticalAlerts = alerts.filter(a => a.severity === 'Critical').length;
  const errorAlerts = alerts.filter(a => a.severity === 'Error').length;
  const potentialSavings = recommendations.reduce((s, r) => s + (r.potentialSavingsUsd ?? 0), 0);
  const retiring90 = retirements.filter(r => r.daysUntilRetirement <= 90);
  const costData = cost;
  const healthStatus = criticalCount > 0 ? 'critical' : activeIncidents.length > 0 ? 'warning' : 'good';
  const alertStatus = criticalAlerts > 0 ? 'critical' : errorAlerts > 0 ? 'warning' : 'good';
  const costStatus = costData
    ? costData.budgetUtilizationPct >= 90 ? 'critical'
      : costData.budgetUtilizationPct >= 75 ? 'warning' : 'good'
    : 'neutral';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <Navbar onRefresh={handleRefresh} onSendReport={() => {}} />

      <main className="mx-auto max-w-screen-2xl px-6 py-8 space-y-8">
        {/* Welcome */}
        <div className="flex items-center gap-3">
          <LayoutDashboard className="h-6 w-6 text-azure-500" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Overview</h1>
            <p className="text-sm text-muted-foreground">
              Good morning{session?.user?.name ? `, ${session.user.name.split(' ')[0]}` : ''}. Here is your Azure tenant status.
            </p>
          </div>
        </div>

        {/* AI Insights banner */}
        <Link
          href="/dashboard/ai-insights"
          className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border bg-gradient-to-r from-violet-500 to-indigo-600 p-5 shadow-lg shadow-violet-500/20 transition-transform hover:scale-[1.01]"
        >
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
          <div className="rounded-xl bg-white/20 p-2.5 backdrop-blur">
            <Sparkles className="h-6 w-6 text-white" />
          </div>
          <div className="flex-1 text-white">
            <h2 className="font-semibold">AI Insights — analyse intelligente de votre tenant</h2>
            <p className="text-sm text-white/80">Brief du matin, priorités, anomalies de coût, corrélations et chat IA</p>
          </div>
          <span className="rounded-full bg-white/20 px-3 py-1.5 text-sm font-medium text-white backdrop-blur transition-colors group-hover:bg-white/30">
            Ouvrir →
          </span>
        </Link>

        {/* Actions & Remediation banner */}
        <Link
          href="/dashboard/actions"
          className="group flex items-center gap-4 rounded-2xl border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-violet-300 dark:hover:border-violet-800"
        >
          <div className="rounded-xl bg-violet-100 dark:bg-violet-950 p-2.5">
            <Wrench className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1">
            <h2 className="font-semibold">Actions & Remédiation</h2>
            <p className="text-sm text-muted-foreground">Recherche IA en langage naturel + nettoyage des ressources (gaspillage, orphelines)</p>
          </div>
          <span className="text-sm font-medium text-violet-600 dark:text-violet-400 group-hover:underline">Ouvrir →</span>
        </Link>

        {/* KPI Stats */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Key Metrics</h2>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${fetchingHealth || fetchingRetirements || fetchingAdvisor || fetchingCost || fetchingAlerts ? 'animate-spin' : ''}`} />
            Refresh all
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {false ? (
            <></>
          ) : (
            <>
              <StatCard
                title="Active Incidents"
                value={activeIncidents.length}
                subtitle={criticalCount > 0 ? `${criticalCount} critical` : 'All clear'}
                icon={Activity}
                status={healthStatus}
                onRefresh={() => refetchHealth()}
                isRefreshing={fetchingHealth}
              />
              <StatCard
                title="Retiring (90d)"
                value={retiring90.length}
                subtitle={`${retirements.filter(r => r.daysUntilRetirement <= 30).length} within 30 days`}
                icon={Archive}
                status={retiring90.length > 0 ? 'warning' : 'good'}
                onRefresh={() => refetchRetirements()}
                isRefreshing={fetchingRetirements}
              />
              <StatCard
                title="Advisor Tips"
                value={recommendations.length}
                subtitle={`${recommendations.filter(r => r.impact === 'High').length} high impact`}
                icon={TrendingUp}
                status={recommendations.some(r => r.impact === 'High') ? 'warning' : 'good'}
                onRefresh={() => refetchAdvisor()}
                isRefreshing={fetchingAdvisor}
              />
              <StatCard
                title="Month Spend"
                value={costData ? formatCurrency(costData.currentMonthSpend, costData.currency) : '—'}
                subtitle={costData ? `${(costData.budgetUtilizationPct ?? 0).toFixed(0)}% of budget` : 'Loading…'}
                icon={DollarSign}
                status={costStatus}
                onRefresh={() => refetchCost()}
                isRefreshing={fetchingCost}
              />
              <StatCard
                title="Active Alerts"
                value={criticalAlerts + errorAlerts + alerts.filter(a => a.severity === 'Warning').length}
                subtitle={`${criticalAlerts} critical • ${errorAlerts} errors`}
                icon={Bell}
                status={alertStatus}
                onRefresh={() => refetchAlerts()}
                isRefreshing={fetchingAlerts}
              />
            </>
          )}
        </div>

        {/* Potential savings callout */}
        {potentialSavings > 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950 p-4 flex items-center gap-3">
            <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
            <p className="text-sm text-green-800 dark:text-green-200">
              <strong>💡 Savings opportunity:</strong> Azure Advisor has identified{' '}
              <strong>{formatCurrency(potentialSavings)}/month</strong> in potential savings across{' '}
              {recommendations?.length} recommendations.{' '}
              <Link href="/dashboard/advisor" className="underline font-medium">Review now →</Link>
            </p>
          </div>
        )}

        {/* Navigation cards */}
        <div>
          <h2 className="text-lg font-semibold mb-4">Explore Sections</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {NAV_TABS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex flex-col items-center gap-3 rounded-xl border bg-card p-6 shadow-sm hover:shadow-md hover:border-azure-500 transition-all"
              >
                <div className="rounded-lg bg-azure-50 dark:bg-azure-900/30 p-3 group-hover:bg-azure-100 dark:group-hover:bg-azure-900/50 transition-colors">
                  <Icon className="h-6 w-6 text-azure-500" />
                </div>
                <span className="text-sm font-medium text-center text-foreground">{label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent incidents preview */}
        {activeIncidents.length > 0 && (
          <div className="rounded-xl border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Activity className="h-5 w-5 text-red-500" />
                Active Incidents
              </h2>
              <Link href="/dashboard/health" className="text-sm text-azure-500 hover:underline">
                View all →
              </Link>
            </div>
            <div className="space-y-3">
              {activeIncidents.slice(0, 3).map((incident) => (
                <div key={incident.id} className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900">
                  <span className="mt-0.5 h-2 w-2 rounded-full bg-red-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{incident.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {incident.impactedServices.slice(0, 3).join(', ')}
                      {incident.impactedRegions.length > 0 && ` • ${incident.impactedRegions.slice(0, 2).join(', ')}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
