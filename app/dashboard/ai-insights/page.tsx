'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, Sparkles, TrendingUp, TrendingDown, AlertTriangle, DollarSign,
  Archive, ShieldAlert, Activity, Link2, Send, Clock, Server, Zap, RefreshCw, Loader2, ChevronRight,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot,
} from 'recharts';
import { cn, formatCurrency } from '@/lib/utils';
import type { InsightsResponse } from '@/lib/ai-insights';

const SUGGESTED_QUESTIONS = [
  'Quelles VMs puis-je éteindre le week-end ?',
  'Quel est mon poste de coût qui dérape le plus ?',
  'Quelles ressources sont à la fois retirées et critiques ?',
  'Résume-moi les risques de sécurité ouverts.',
];

const CATEGORY_META: Record<string, { color: string; icon: typeof DollarSign; label: string }> = {
  cost: { color: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50', icon: DollarSign, label: 'Coût' },
  reliability: { color: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50', icon: Activity, label: 'Fiabilité' },
  security: { color: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50', icon: ShieldAlert, label: 'Sécurité' },
  retirement: { color: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50', icon: Archive, label: 'Retrait' },
  incident: { color: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50', icon: AlertTriangle, label: 'Incident' },
  advisor: { color: 'text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-950/50', icon: Sparkles, label: 'Advisor' },
};

const CLUSTER_CAT_COLOR: Record<string, string> = {
  Cost: 'bg-emerald-500', Security: 'bg-red-500', Reliability: 'bg-blue-500',
  Performance: 'bg-violet-500', OperationalExcellence: 'bg-slate-500',
};

const FROM = '?from=ai-insights';
const HIGHLIGHT_LINK: Record<string, string> = {
  incident: `/dashboard/health${FROM}`,
  cost: `/dashboard/cost${FROM}`,
  retirement: `/dashboard/retirements${FROM}`,
  advisor: `/dashboard/advisor${FROM}`,
  security: `/dashboard/advisor${FROM}`,
  reliability: `/dashboard/advisor${FROM}`,
};

const SOURCE_COLOR: Record<string, string> = {
  Health: 'bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
  Alerts: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
  Advisor: 'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  Cost: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
};

export default function AIInsightsPage() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<InsightsResponse>({
    queryKey: ['ai-insights'],
    queryFn: async () => {
      const res = await fetch('/api/ai/insights');
      if (!res.ok) throw new Error('Failed to load insights');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 p-2 shadow-lg shadow-violet-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">AI Insights</h1>
              <p className="text-xs text-muted-foreground">
                Analyse IA de votre tenant{data?.model && data.model !== 'fallback' ? ` · ${data.model}` : ''}
                {data?.generatedAt ? ` · ${new Date(data.generatedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}` : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="ml-auto inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            Régénérer
          </button>
        </div>

        {data?.degraded && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">
            ⚠️ Synthèse générée en mode dégradé (IA indisponible — vérifiez <code>ANTHROPIC_API_KEY</code>). Données réelles, analyse simplifiée.
          </div>
        )}

        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950 p-8 text-center text-red-800 dark:text-red-200">
            Impossible de charger l'analyse IA. Vérifiez vos identifiants Azure et la clé Anthropic.
          </div>
        ) : data ? (
          <>
            <BriefAndScore data={data} />
            <PriorityActions data={data} />
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3"><CostAnomalies data={data} /></div>
              <div className="lg:col-span-2"><AdvisorClusters data={data} /></div>
            </div>
            {data.correlations.length > 0 && <Correlations data={data} />}
            {data.retirementImpacts.length > 0 && <RetirementImpacts data={data} />}
            <ChatPanel />
          </>
        ) : null}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="rounded-2xl border bg-card p-12 text-center shadow-sm">
      <div className="inline-flex rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 p-3 shadow-lg shadow-violet-500/30 mb-4">
        <Loader2 className="h-6 w-6 text-white animate-spin" />
      </div>
      <p className="font-semibold">Analyse de votre tenant en cours…</p>
      <p className="text-sm text-muted-foreground mt-1">L'IA agrège vos données Health, Advisor, Cost, Alerts et Retirements.</p>
    </div>
  );
}

/* ---------- 1. Morning brief + health score ---------- */
function BriefAndScore({ data }: { data: InsightsResponse }) {
  const { healthScore, morningBrief } = data;
  const delta = healthScore.previous != null ? healthScore.current - healthScore.previous : null;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border bg-card p-6 shadow-sm">
        <div className="absolute right-0 top-0 h-32 w-32 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <h2 className="font-semibold">Brief du matin</h2>
          <span className="text-xs text-muted-foreground">· {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
        </div>
        <p className="text-sm leading-relaxed text-foreground/90 mb-4">{morningBrief.summary}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {morningBrief.highlights.map((h, i) => {
            const meta = CATEGORY_META[h.icon] ?? CATEGORY_META.incident;
            const Icon = meta.icon;
            return (
              <Link
                key={i}
                href={HIGHLIGHT_LINK[h.icon] ?? '/dashboard'}
                className="group flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 transition-colors hover:bg-muted hover:ring-1 hover:ring-violet-300 dark:hover:ring-violet-800"
              >
                <Icon className={cn('h-4 w-4 shrink-0', meta.color.split(' ')[0])} />
                <span className="text-xs font-medium flex-1">{h.text}</span>
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6 shadow-sm flex flex-col">
        <h2 className="font-semibold text-sm mb-4">Score de santé tenant</h2>
        <div className="flex items-center justify-center flex-1">
          <ScoreRing score={healthScore.current} />
        </div>
        {delta != null && (
          <div className="flex items-center justify-center gap-1.5 mt-3 text-sm">
            {delta < 0 ? <TrendingDown className="h-4 w-4 text-red-500" /> : <TrendingUp className="h-4 w-4 text-emerald-500" />}
            <span className={delta < 0 ? 'text-red-500 font-medium' : 'text-emerald-500 font-medium'}>{delta > 0 ? '+' : ''}{delta}</span>
            <span className="text-muted-foreground text-xs">vs estimation précédente</span>
          </div>
        )}
        <div className="mt-4 space-y-1.5">
          {healthScore.bySubscription.map((s) => (
            <div key={s.name} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate text-muted-foreground" title={s.name}>{s.name}</span>
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full', s.score >= 80 ? 'bg-emerald-500' : s.score >= 65 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${s.score}%` }} />
              </div>
              <span className="w-6 text-right font-medium tabular-nums">{s.score}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 80 ? '#10b981' : score >= 65 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative h-36 w-36">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/40" />
        <circle cx="60" cy="60" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums">{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
}

/* ---------- 2. Priority actions ---------- */
function PriorityActions({ data }: { data: InsightsResponse }) {
  if (data.priorityActions.length === 0) return null;
  return (
    <section>
      <SectionTitle icon={Zap} title="Priorités du jour" subtitle="Top actions priorisées et croisées par l'IA" />
      <div className="space-y-2.5">
        {data.priorityActions.map((a) => {
          const meta = CATEGORY_META[a.category] ?? CATEGORY_META.incident;
          const Icon = meta.icon;
          return (
            <Link key={a.rank} href={HIGHLIGHT_LINK[a.category] ?? '/dashboard'}
              className="group flex items-start gap-4 rounded-xl border bg-card p-4 shadow-sm transition-all hover:shadow-md hover:border-violet-300 dark:hover:border-violet-800">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-sm font-bold text-white shadow">{a.rank}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-sm group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">{a.title}</h3>
                  <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', meta.color)}>
                    <Icon className="h-3 w-3" /> {meta.label}
                  </span>
                  {a.deadline && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 dark:bg-red-950 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-300">
                      <Clock className="h-3 w-3" /> {a.deadline}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{a.why}</p>
              </div>
              <div className="hidden sm:flex flex-col items-end gap-1 shrink-0 text-right">
                <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{a.impact}</span>
                <span className="text-xs text-muted-foreground">Effort : {a.effort}</span>
              </div>
              <ChevronRight className="h-4 w-4 self-center shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ---------- 3. Cost anomalies ---------- */
function CostAnomalies({ data }: { data: InsightsResponse }) {
  const trend = data.costTrend ?? [];
  // Highlight the steepest day-over-day jump
  let anomalyDate: string | null = null;
  let maxJump = 0;
  for (let i = 1; i < trend.length; i++) {
    const jump = trend[i].cost - trend[i - 1].cost;
    if (jump > maxJump) { maxJump = jump; anomalyDate = trend[i].date; }
  }
  const anomalyPoint = trend.find((d) => d.date === anomalyDate);

  return (
    <section className="h-full">
      <SectionTitle icon={TrendingUp} title="Détection d'anomalies de coût" subtitle="Tendance journalière — tenant complet" />
      <div className="rounded-2xl border bg-card p-5 shadow-sm space-y-4">
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
              <Tooltip formatter={(v: number) => [formatCurrency(v), 'Coût/jour']} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
              <Area type="monotone" dataKey="cost" stroke="#8b5cf6" strokeWidth={2} fill="url(#costGrad)" />
              {anomalyPoint && <ReferenceDot x={anomalyPoint.date} y={anomalyPoint.cost} r={5} fill="#ef4444" stroke="#fff" strokeWidth={2} />}
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-8">Pas de données de coût journalières disponibles.</p>
        )}
        <div className="space-y-2.5">
          {data.costAnomalies.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20 p-3.5 text-sm text-emerald-700 dark:text-emerald-300">
              ✅ Aucune anomalie de coût détectée.
            </div>
          ) : data.costAnomalies.map((a) => (
            <div key={a.resourceGroup} className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                  <span className="font-semibold text-sm">{a.resourceGroup}</span>
                </div>
                <span className="text-sm font-bold text-red-600 dark:text-red-400">{a.changePct > 0 ? '+' : ''}{a.changePct}%</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">
                {formatCurrency(a.fromUsd)} → <strong className="text-foreground">{formatCurrency(a.toUsd)}</strong> · {a.likelyCause}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 4. Advisor clusters ---------- */
function AdvisorClusters({ data }: { data: InsightsResponse }) {
  const clusters = data.advisorClusters;
  const max = Math.max(1, ...clusters.map((c) => c.count));
  const totalSavings = clusters.reduce((s, c) => s + (c.savingsUsd ?? 0), 0);
  return (
    <section className="h-full">
      <SectionTitle icon={Sparkles} title="Clusters Advisor" subtitle={`Recommandations regroupées en ${clusters.length} thèmes`} />
      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        {totalSavings > 0 && (
          <div className="mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-center">
            <span className="text-xs text-muted-foreground">Économies regroupées</span>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalSavings)}<span className="text-sm font-normal">/mois</span></p>
          </div>
        )}
        <div className="space-y-3">
          {clusters.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Aucune recommandation.</p>
          ) : clusters.map((c) => (
            <div key={c.key} title={c.topResources.join(', ')}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-medium truncate">{c.label}</span>
                <span className="text-muted-foreground tabular-nums shrink-0 ml-2">
                  {c.count}{c.savingsUsd ? ` · ${formatCurrency(c.savingsUsd)}` : ''}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div className={cn('h-full rounded-full', CLUSTER_CAT_COLOR[c.category] ?? 'bg-slate-500')} style={{ width: `${(c.count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- 5. Correlations ---------- */
function Correlations({ data }: { data: InsightsResponse }) {
  return (
    <section>
      <SectionTitle icon={Link2} title="Corrélations cross-sources" subtitle="L'IA relie des signaux isolés en un diagnostic unique" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.correlations.map((c) => (
          <div key={c.id} className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-sm">{c.title}</h3>
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                c.confidence === 'Élevée' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300')}>
                Confiance {c.confidence}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{c.diagnosis}</p>
            <div className="flex flex-wrap items-center gap-1.5">
              {c.signals.map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className={cn('rounded px-2 py-0.5 text-xs font-medium', SOURCE_COLOR[s.source])}>{s.source}</span>
                  {i < c.signals.length - 1 && <span className="text-muted-foreground">+</span>}
                </div>
              ))}
            </div>
            <div className="space-y-1 border-l-2 border-violet-300 dark:border-violet-800 pl-3">
              {c.signals.map((s, i) => (
                <p key={i} className="text-xs text-muted-foreground"><span className="font-medium text-foreground">{s.source} :</span> {s.detail}</p>
              ))}
            </div>
            <div className="rounded-lg bg-violet-50 dark:bg-violet-950/40 p-3">
              <p className="text-xs leading-relaxed"><span className="font-semibold text-violet-700 dark:text-violet-300">Recommandation : </span>{c.recommendation}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- 6. Retirement impact ---------- */
function RetirementImpacts({ data }: { data: InsightsResponse }) {
  return (
    <section>
      <SectionTitle icon={Archive} title="Impact des retraits sur vos ressources" subtitle="Croisé avec votre inventaire réel" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {data.retirementImpacts.map((r, idx) => (
          <div key={idx} className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{r.service}</span>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold',
                r.daysLeft <= 7 ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                  : r.daysLeft <= 90 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300')}>
                {r.daysLeft}j
              </span>
            </div>
            <h3 className="font-semibold text-sm leading-snug">{r.title}</h3>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Server className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{r.affectedCount} ressources</span> affectées
            </div>
            {r.affectedResources.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {r.affectedResources.slice(0, 4).map((res) => (
                  <span key={res} className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-mono text-muted-foreground">{res}</span>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground border-t pt-2"><span className="font-medium text-foreground">Effort :</span> {r.effort}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- 7. Chat (streaming) ---------- */
interface ChatTurn { role: 'user' | 'assistant'; content: string }

function ChatPanel() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (streaming) return;
    const nextTurns: ChatTurn[] = [...turns, { role: 'user', content: question }];
    setTurns([...nextTurns, { role: 'assistant', content: '' }]);
    setInput('');
    setStreaming(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextTurns }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Erreur réseau');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setTurns([...nextTurns, { role: 'assistant', content: acc }]);
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }
    } catch (e) {
      setTurns([...nextTurns, { role: 'assistant', content: `⚠️ ${e instanceof Error ? e.message : 'Erreur'}` }]);
    } finally {
      setStreaming(false);
    }
  }

  return (
    <section>
      <SectionTitle icon={Sparkles} title="Chat sur votre tenant" subtitle="Posez une question en langage naturel — réponses basées sur vos données live" />
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
        <div ref={scrollRef} className="max-h-96 overflow-y-auto p-5 space-y-4">
          {turns.length === 0 && (
            <div className="text-center py-8">
              <div className="inline-flex rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 p-3 shadow-lg shadow-violet-500/30 mb-3">
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <p className="text-sm text-muted-foreground mb-4">Essayez une de ces questions :</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button key={q} onClick={() => ask(q)} disabled={streaming}
                    className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors disabled:opacity-50">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) => (
            <div key={i} className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-line leading-relaxed',
                t.role === 'user' ? 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white' : 'bg-muted text-foreground')}>
                {t.content || (streaming && i === turns.length - 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : '')}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (input.trim() && !streaming) ask(input.trim()); }}
          className="flex items-center gap-2 border-t p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={streaming}
            placeholder="Posez une question sur votre tenant…"
            className="flex-1 rounded-xl border bg-background px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-950 disabled:opacity-50"
          />
          <button type="submit" disabled={streaming || !input.trim()}
            className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 p-2.5 text-white shadow hover:opacity-90 transition-opacity disabled:opacity-50">
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
      <p className="mt-2 text-center text-xs text-muted-foreground">Réponses générées par Claude à partir de vos données Azure live</p>
    </section>
  );
}

/* ---------- shared ---------- */
function SectionTitle({ icon: Icon, title, subtitle }: { icon: typeof DollarSign; title: string; subtitle: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <Icon className="h-5 w-5 text-violet-500" />
      <div>
        <h2 className="font-semibold leading-tight">{title}</h2>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}
