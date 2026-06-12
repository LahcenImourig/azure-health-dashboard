import { requireAuth } from '@/lib/auth-guard';
import { getAllSubscriptions } from '@/lib/azure-client';
import { getAIClient, isAIConfigured, resolveModel } from '@/lib/ai-client';
import { buildSnapshot, type TenantData } from '@/lib/ai-insights';
import type { ServiceHealthEvent, RetirementNotice, AdvisorRecommendation, AlertRule, CostSummary } from '@/types/azure';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

interface ChatMessage { role: 'user' | 'assistant'; content: string }

async function fetchInternal<T>(origin: string, path: string, cookie: string, fallback: T): Promise<T> {
  try {
    const res = await fetch(`${origin}${path}`, { headers: { cookie }, cache: 'no-store' });
    if (!res.ok) return fallback;
    const data = await res.json();
    return (data && typeof data === 'object' && 'error' in data) ? fallback : (data as T);
  } catch {
    return fallback;
  }
}

const CHAT_SYSTEM = `Tu es l'assistant IA d'un dashboard Azure. Tu réponds en FRANÇAIS aux questions de l'équipe IT sur l'état de leur tenant Azure, en t'appuyant UNIQUEMENT sur le snapshot fourni ci-dessous.

Règles :
- Sois concret, factuel et concis. Cite des chiffres et des noms de ressources réels du snapshot.
- Si la donnée n'est pas dans le snapshot, dis-le clairement plutôt que d'inventer.
- Quand c'est pertinent, propose une action ou une priorité.
- Formate avec des sauts de ligne et des puces quand ça aide la lisibilité (markdown léger).`;

export async function POST(req: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });

  if (!isAIConfigured()) return new Response(JSON.stringify({ error: 'IA non configurée' }), { status: 503 });

  let body: { messages?: ChatMessage[] };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Invalid body' }), { status: 400 }); }
  const history = Array.isArray(body.messages) ? body.messages.filter(m => m.role && typeof m.content === 'string').slice(-12) : [];
  if (history.length === 0) return new Response(JSON.stringify({ error: 'No messages' }), { status: 400 });

  // Gather a fresh snapshot for grounding
  const origin = new URL(req.url).origin;
  const cookie = req.headers.get('cookie') ?? '';
  const [incidents, retirements, recommendations, alerts, cost, subscriptions] = await Promise.all([
    fetchInternal<ServiceHealthEvent[]>(origin, '/api/azure/health', cookie, []),
    fetchInternal<RetirementNotice[]>(origin, '/api/azure/retirements', cookie, []),
    fetchInternal<AdvisorRecommendation[]>(origin, '/api/azure/advisor', cookie, []),
    fetchInternal<AlertRule[]>(origin, '/api/azure/alerts', cookie, []),
    fetchInternal<CostSummary | null>(origin, '/api/azure/cost', cookie, null),
    getAllSubscriptions(),
  ]);

  const data: TenantData = {
    incidents: Array.isArray(incidents) ? incidents : [],
    retirements: Array.isArray(retirements) ? retirements : [],
    recommendations: Array.isArray(recommendations) ? recommendations : [],
    alerts: Array.isArray(alerts) ? alerts : [],
    cost: cost && typeof cost === 'object' ? cost : null,
    subscriptions: subscriptions.map(s => ({ id: s.id, displayName: s.displayName })),
  };

  const snapshot = buildSnapshot(data);
  const client = getAIClient();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        const llmStream = client.messages.stream({
          model: resolveModel(),
          max_tokens: 2000,
          system: `${CHAT_SYSTEM}\n\n${snapshot}`,
          messages: history.map(m => ({ role: m.role, content: m.content })),
        });

        for await (const event of llmStream) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        console.error('Chat stream error:', err);
        controller.enqueue(encoder.encode('\n\n[Erreur lors de la génération de la réponse.]'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
