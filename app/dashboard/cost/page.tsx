'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { ArrowLeft, DollarSign, RefreshCw, TrendingUp } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import { ChartSkeleton, StatCardSkeleton } from '@/components/dashboard/loading-skeleton';
import { BackLink } from '@/components/dashboard/back-link';
import { formatCurrency } from '@/lib/utils';
import type { CostSummary, ReservationSummary } from '@/types/azure';

const COLORS = ['#0078d4', '#50e6ff', '#0091da', '#004e8c', '#29aba4', '#038387', '#006f94', '#005b70', '#a4262c', '#ca5010'];

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min((value / max) * 100, 100);
  return (
    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function CostPage() {
  const { data: cost, isLoading, error, refetch, isFetching } = useQuery<CostSummary>({
    queryKey: ['cost'],
    queryFn: () => fetch('/api/azure/cost').then(r => r.json()),
  });

  const budgetPct = cost?.budgetUtilizationPct ?? 0;
  const budgetColor = budgetPct >= 90 ? 'bg-red-500' : budgetPct >= 75 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-6">
        <div className="flex items-center gap-4">
          <BackLink />
          <DollarSign className="h-6 w-6 text-azure-500" />
          <h1 className="text-2xl font-bold">Cost Analysis — All Subscriptions</h1>
          <button onClick={() => refetch()} disabled={isFetching} className="ml-auto p-2 rounded-md hover:bg-muted text-muted-foreground">
            <RefreshCw className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 p-4 text-sm text-red-800 dark:text-red-200">
            Failed to load cost data. Ensure Cost Management API is enabled on all subscriptions.
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton />
            </div>
            <ChartSkeleton /><ChartSkeleton />
          </div>
        ) : cost && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
                <p className="text-sm text-muted-foreground font-medium">Current Month Spend</p>
                <p className="text-3xl font-bold">{formatCurrency(cost.currentMonthSpend, cost.currency)}</p>
                <p className="text-xs text-muted-foreground">{cost.bySubscription?.length ?? 0} subscription(s)</p>
              </div>
              <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
                <p className="text-sm text-muted-foreground font-medium">Forecasted (End of Month)</p>
                <p className="text-3xl font-bold flex items-center gap-2">
                  {formatCurrency(cost.forecastedMonthSpend, cost.currency)}
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                </p>
              </div>
              <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Budget Utilization</span>
                  <span className={`font-semibold ${budgetPct >= 90 ? 'text-red-600' : budgetPct >= 75 ? 'text-yellow-600' : 'text-green-600'}`}>
                    {budgetPct.toFixed(1)}%
                  </span>
                </div>
                <ProgressBar value={cost.currentMonthSpend} max={cost.monthlyBudget} color={budgetColor} />
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(cost.currentMonthSpend, cost.currency)} of {formatCurrency(cost.monthlyBudget, cost.currency)} global budget
                </p>
              </div>
            </div>

            {/* Per-subscription breakdown */}
            {(cost.bySubscription?.length ?? 0) > 1 && (
              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="font-semibold text-base mb-4">Cost by Subscription</h2>
                <div className="space-y-3">
                  {(cost.bySubscription ?? []).map((sub, i) => {
                    const pct = cost.currentMonthSpend > 0 ? (sub.cost / cost.currentMonthSpend) * 100 : 0;
                    return (
                      <div key={sub.subscriptionId} className="space-y-1.5">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium truncate max-w-[260px]" title={sub.subscriptionName}>
                            {sub.subscriptionName}
                          </span>
                          <span className="tabular-nums text-muted-foreground">
                            {formatCurrency(sub.cost, sub.currency)} <span className="text-xs">({pct.toFixed(1)}%)</span>
                          </span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Daily trend */}
            <div className="rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="font-semibold text-base mb-4">Daily Spend — Current Month (All Subscriptions)</h2>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={cost.dailyCosts ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                  <Tooltip formatter={(v: number) => [formatCurrency(v, cost.currency), 'Cost']} />
                  <Area type="monotone" dataKey="cost" stroke="#0078d4" fill="#0078d4" fillOpacity={0.15} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* By service + by resource group */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="font-semibold text-base mb-4">Top Services (All Subscriptions)</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={cost.byService ?? []} dataKey="cost" nameKey="service" cx="50%" cy="50%" outerRadius={90}
                      label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                      {(cost.byService ?? []).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatCurrency(v, cost.currency)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="font-semibold text-base mb-4">Top Resource Groups</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={(cost.byResourceGroup ?? []).slice(0, 8)} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `$${v}`} />
                    <YAxis type="category" dataKey="resourceGroup" tick={{ fontSize: 11 }} width={130} />
                    <Tooltip formatter={(v: number) => [formatCurrency(v, cost.currency), 'Cost']} />
                    <Bar dataKey="cost" fill="#0078d4" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Reservations */}
            {(cost.reservations?.length ?? 0) > 0 && (
              <div className="rounded-xl border bg-card p-6 shadow-sm">
                <h2 className="font-semibold text-base mb-4">Reservations — Utilization</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-4 font-medium">Name / SKU</th>
                        <th className="pb-2 pr-4 font-medium">Location</th>
                        <th className="pb-2 pr-4 font-medium">Term</th>
                        <th className="pb-2 pr-4 font-medium">Utilization</th>
                        <th className="pb-2 pr-4 font-medium">Hours (used/total)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {cost.reservations!.map((r, i) => {
                        const utilColor = r.utilizationPct >= 80 ? 'text-green-600' : r.utilizationPct >= 50 ? 'text-yellow-600' : 'text-red-600';
                        return (
                          <tr key={i} className="hover:bg-muted/50">
                            <td className="py-2 pr-4">
                              <p className="font-medium">{r.reservationName || r.reservationId}</p>
                              <p className="text-xs text-muted-foreground">{r.skuName}</p>
                            </td>
                            <td className="py-2 pr-4">{r.location || '—'}</td>
                            <td className="py-2 pr-4">{r.term || '—'}</td>
                            <td className="py-2 pr-4">
                              <span className={`font-semibold ${utilColor}`}>{r.utilizationPct.toFixed(1)}%</span>
                              <div className="mt-1 h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${r.utilizationPct >= 80 ? 'bg-green-500' : r.utilizationPct >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                  style={{ width: `${Math.min(r.utilizationPct, 100)}%` }}
                                />
                              </div>
                            </td>
                            <td className="py-2 pr-4 tabular-nums">{Math.round(r.usedHours)} / {Math.round(r.totalHours)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {cost.reservations!.some(r => r.utilizationPct < 50) && (
                  <div className="mt-4 rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-900 p-3 text-sm text-yellow-800 dark:text-yellow-200">
                    ⚠️ Certaines réservations ont une utilisation inférieure à 50%. Envisagez un échange ou une annulation.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
