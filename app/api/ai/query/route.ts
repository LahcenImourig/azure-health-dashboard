import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { queryResourceGraph } from '@/lib/azure-client';
import { getAIClient, isAIConfigured, resolveModel } from '@/lib/ai-client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SYSTEM = `Tu traduis une question en langage naturel en une requête Azure Resource Graph (KQL).

Règles STRICTES :
- Réponds UNIQUEMENT avec la requête KQL brute, sans texte, sans markdown, sans backticks.
- Resource Graph est en LECTURE SEULE — n'utilise que des opérateurs de requête (where, project, summarize, extend, join, order by, limit...).
- Tables disponibles : Resources, ResourceContainers, ServiceHealthResources, AdvisorResources, SecurityResources, HealthResources, AlertsManagementResources, PolicyResources.
- Les noms de type sont en minuscules (ex. 'microsoft.compute/virtualmachines').
- Termine TOUJOURS par « | limit 100 » (ou moins).
- Projette des colonnes lisibles : name, resourceGroup, location, subscriptionId, et les propriétés utiles.
- Ne fabrique pas de colonnes qui n'existent pas ; en cas de doute, projette id, name, type, resourceGroup, location.`;

function cleanKql(text: string): string {
  let t = text.trim();
  const fence = t.match(/```(?:kusto|kql)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  return t;
}

export async function POST(req: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAIConfigured()) return NextResponse.json({ error: 'IA non configurée' }, { status: 503 });

  let body: { question?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }
  const question = (body.question ?? '').trim();
  if (!question) return NextResponse.json({ error: 'Question vide' }, { status: 400 });

  try {
    const client = getAIClient();
    const msg = await client.messages.create({
      model: resolveModel(),
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: question }],
    });
    const kql = cleanKql(msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join(''));

    // Safety: Resource Graph is read-only, but reject anything that doesn't look like a query
    if (!kql || /^\s*(remove|delete|set|update|drop)\b/i.test(kql)) {
      return NextResponse.json({ error: 'Requête non valide', kql }, { status: 400 });
    }

    const rows = await queryResourceGraph(kql) as Record<string, unknown>[];
    const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
    return NextResponse.json({ kql, columns, rows: rows.slice(0, 100), count: rows.length });
  } catch (error) {
    console.error('NL2KQL error:', error);
    const message = error instanceof Error ? error.message : 'Échec de la requête';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
