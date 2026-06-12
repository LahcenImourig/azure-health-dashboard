'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Sparkles, Search, Loader2, Wrench, ShieldAlert, ChevronDown, ChevronUp,
  ExternalLink, AlertTriangle, CheckCircle2, XCircle, Database, Terminal,
} from 'lucide-react';
import { BackLink } from '@/components/dashboard/back-link';
import { cn, formatCurrency } from '@/lib/utils';

const RISK_STYLES: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  high: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300',
};
const RISK_LABEL: Record<string, string> = { low: 'Risque faible', medium: 'Risque moyen', high: 'Risque élevé' };

export default function ActionsPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="mx-auto max-w-screen-xl px-6 py-8 space-y-8">
        <div className="flex items-center gap-4">
          <BackLink />
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 p-2 shadow-lg shadow-violet-500/30">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Actions & Remédiation</h1>
              <p className="text-xs text-muted-foreground">Recherche IA en langage naturel + remédiation sécurisée</p>
            </div>
          </div>
        </div>

        <NaturalLanguageExplorer />
        <RemediationPanel />
      </div>
    </div>
  );
}

/* ----------------------- NL2KQL Explorer ----------------------- */
interface QueryResult { kql: string; columns: string[]; rows: Record<string, unknown>[]; count: number; }

function NaturalLanguageExplorer() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showKql, setShowKql] = useState(false);

  const examples = [
    'Toutes les VM sans tag « environment »',
    'Comptes de stockage sans HTTPS forcé',
    'Disques managés de plus de 512 Go',
    'Ressources créées dans West Europe',
  ];

  async function run(question: string) {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch('/api/ai/query', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erreur');
      setResult(data); setShowKql(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally { setLoading(false); }
  }

  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <Search className="h-5 w-5 text-violet-500" />
        <div>
          <h2 className="font-semibold leading-tight">Recherche en langage naturel</h2>
          <p className="text-xs text-muted-foreground">Pose une question — l'IA génère et exécute la requête Resource Graph</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card shadow-sm p-5 space-y-4">
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim() && !loading) run(q.trim()); }} className="flex gap-2">
          <input
            value={q} onChange={(e) => setQ(e.target.value)} disabled={loading}
            placeholder="Ex : toutes les VM sans backup en West Europe"
            className="flex-1 rounded-xl border bg-background px-4 py-2.5 text-sm outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100 dark:focus:ring-violet-950 disabled:opacity-50"
          />
          <button type="submit" disabled={loading || !q.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow hover:opacity-90 disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Chercher
          </button>
        </form>

        {!result && !loading && (
          <div className="flex flex-wrap gap-2">
            {examples.map((ex) => (
              <button key={ex} onClick={() => { setQ(ex); run(ex); }}
                className="rounded-full border bg-card px-3 py-1.5 text-xs font-medium hover:border-violet-300 hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors">
                {ex}
              </button>
            ))}
          </div>
        )}

        {error && <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950 p-3 text-sm text-red-700 dark:text-red-300">{error}</div>}

        {result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{result.count} résultat{result.count > 1 ? 's' : ''}</p>
              <button onClick={() => setShowKql(!showKql)} className="inline-flex items-center gap-1.5 text-xs text-violet-500 hover:underline">
                <Terminal className="h-3.5 w-3.5" /> {showKql ? 'Masquer' : 'Voir'} la requête KQL
                {showKql ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
            {showKql && (
              <pre className="rounded-lg bg-slate-900 text-slate-100 p-3 text-xs overflow-x-auto whitespace-pre-wrap">{result.kql}</pre>
            )}
            {result.rows.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>{result.columns.map((c) => <th key={c} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{c}</th>)}</tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30">
                        {result.columns.map((c) => (
                          <td key={c} className="px-3 py-1.5 whitespace-nowrap max-w-[280px] truncate" title={fmt(row[c])}>{fmt(row[c])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Aucun résultat.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function fmt(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/* ----------------------- Remediation ----------------------- */
interface CandidateResource { id: string; name: string; type: string; resourceGroup: string; subscriptionId: string; detail?: string; estimatedMonthlyUsd?: number; script: string; }
interface DiscoveredAction { type: string; label: string; description: string; risk: string; category: string; count: number; estimatedMonthlyUsd: number; resources: CandidateResource[]; }
interface RemediationData { actions: DiscoveredAction[]; executionEnabled: boolean; }

function RemediationPanel() {
  const { data, isLoading, error, refetch, isFetching } = useQuery<RemediationData>({
    queryKey: ['remediation'],
    queryFn: async () => { const r = await fetch('/api/remediation'); if (!r.ok) throw new Error('fail'); return r.json(); },
    refetchOnWindowFocus: false,
  });

  return (
    <section>
      <div className="mb-3 flex items-center gap-2.5">
        <Wrench className="h-5 w-5 text-violet-500" />
        <div className="flex-1">
          <h2 className="font-semibold leading-tight">Remédiation assistée</h2>
          <p className="text-xs text-muted-foreground">Actions sûres détectées — proposition puis exécution validée</p>
        </div>
        <button onClick={() => refetch()} disabled={isFetching} className="text-xs text-violet-500 hover:underline disabled:opacity-50">
          {isFetching ? 'Analyse…' : 'Rafraîchir'}
        </button>
      </div>

      {data && !data.executionEnabled && (
        <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-800 dark:text-amber-200">
          🔒 <strong>Mode simulation</strong> — l'exécution réelle est désactivée (<code>REMEDIATION_ENABLED</code> non activé, SP en lecture seule). « Valider » enregistre l'intention sans modifier Azure.
        </div>
      )}

      {isLoading ? (
        <div className="rounded-2xl border bg-card p-10 text-center"><Loader2 className="h-6 w-6 animate-spin text-violet-500 mx-auto" /><p className="text-sm text-muted-foreground mt-2">Détection des ressources à nettoyer…</p></div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 dark:bg-red-950 p-6 text-center text-red-700 dark:text-red-300">Échec de la détection.</div>
      ) : (
        <div className="space-y-4">
          {data?.actions.map((a) => <ActionCard key={a.type} action={a} executionEnabled={data.executionEnabled} />)}
        </div>
      )}
    </section>
  );
}

function ActionCard({ action, executionEnabled }: { action: DiscoveredAction; executionEnabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set(action.resources.map(r => r.id)));
  const [confirm, setConfirm] = useState('');
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<{ executed: boolean; succeeded: number; failed: number; results: { id: string; name: string; ok: boolean; error?: string }[] } | null>(null);

  const canExecute = confirm.trim().toLowerCase() === 'valider' && selected.size > 0 && !running;

  function toggle(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function execute() {
    setRunning(true); setOutcome(null);
    try {
      const res = await fetch('/api/remediation/execute', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actionType: action.type, resourceIds: Array.from(selected), confirm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Erreur');
      setOutcome(data); setConfirm('');
    } catch (e) {
      setOutcome({ executed: false, succeeded: 0, failed: selected.size, results: [{ id: '', name: e instanceof Error ? e.message : 'Erreur', ok: false }] });
    } finally { setRunning(false); }
  }

  if (action.count === 0) {
    return (
      <div className="rounded-2xl border bg-card p-4 shadow-sm flex items-center gap-3 opacity-70">
        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
        <div><h3 className="font-semibold text-sm">{action.label}</h3><p className="text-xs text-muted-foreground">Rien à nettoyer ✅</p></div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{action.label}</h3>
              <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', RISK_STYLES[action.risk])}>{RISK_LABEL[action.risk]}</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">{action.description}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold tabular-nums">{action.count}</p>
            {action.estimatedMonthlyUsd > 0 && <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">{formatCurrency(action.estimatedMonthlyUsd)}/mois</p>}
          </div>
        </div>
        <button onClick={() => setOpen(!open)} className="mt-3 inline-flex items-center gap-1.5 text-sm text-violet-500 hover:underline">
          <Database className="h-3.5 w-3.5" /> {open ? 'Masquer' : 'Voir et remédier'} ({selected.size}/{action.count} sélectionnées)
          {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
      </div>

      {open && (
        <div className="border-t bg-muted/30 p-5 space-y-4">
          {/* Resource list */}
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {action.resources.map((r) => (
              <label key={r.id} className="flex items-center gap-3 rounded-lg bg-card border px-3 py-2 text-sm cursor-pointer hover:border-violet-300 dark:hover:border-violet-800">
                <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="accent-violet-500" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{r.resourceGroup}{r.detail ? ` · ${r.detail}` : ''}</p>
                </div>
                {r.estimatedMonthlyUsd ? <span className="text-xs text-emerald-600 dark:text-emerald-400 shrink-0">{formatCurrency(r.estimatedMonthlyUsd)}/mo</span> : null}
                <a href={`https://portal.azure.com/#resource${r.id}`} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="shrink-0 text-azure-500"><ExternalLink className="h-3.5 w-3.5" /></a>
              </label>
            ))}
          </div>

          {/* Script preview */}
          <details className="rounded-lg border bg-card">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Terminal className="h-3.5 w-3.5" /> Script généré (az cli)</summary>
            <pre className="border-t bg-slate-900 text-slate-100 p-3 text-[11px] overflow-x-auto max-h-40">
{action.resources.filter(r => selected.has(r.id)).map(r => r.script).join('\n') || '# Aucune ressource sélectionnée'}
            </pre>
          </details>

          {/* Validation + execute */}
          <div className="rounded-xl border border-violet-200 dark:border-violet-900 bg-violet-50/50 dark:bg-violet-950/30 p-4 space-y-3">
            <p className="text-sm flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              Pour exécuter sur <strong>{selected.size}</strong> ressource{selected.size > 1 ? 's' : ''}, tapez <code className="rounded bg-muted px-1.5 py-0.5 font-mono">valider</code> :
            </p>
            <div className="flex gap-2">
              <input
                value={confirm} onChange={(e) => setConfirm(e.target.value)}
                placeholder="Tapez « valider »"
                className="flex-1 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
              <button onClick={execute} disabled={!canExecute}
                className={cn('inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow transition-opacity',
                  canExecute ? 'bg-red-600 hover:opacity-90' : 'bg-muted-foreground/40 cursor-not-allowed')}>
                {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                {executionEnabled ? 'Exécuter' : 'Simuler'}
              </button>
            </div>
          </div>

          {/* Outcome */}
          {outcome && (
            <div className={cn('rounded-xl border p-4', outcome.failed === 0 ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50 dark:bg-amber-950/30')}>
              <p className="text-sm font-medium flex items-center gap-2">
                {outcome.failed === 0 ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                {outcome.executed ? 'Exécution terminée' : 'Simulation terminée'} — {outcome.succeeded} ok{outcome.failed > 0 ? `, ${outcome.failed} échec(s)` : ''}
              </p>
              {!outcome.executed && <p className="text-xs text-muted-foreground mt-1">Aucune ressource modifiée (mode simulation).</p>}
              {outcome.results.some(r => !r.ok) && (
                <div className="mt-2 space-y-1">
                  {outcome.results.filter(r => !r.ok).slice(0, 8).map((r, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5"><XCircle className="h-3 w-3 shrink-0" />{r.name}: {r.error}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
