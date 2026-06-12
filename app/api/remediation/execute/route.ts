import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { executeRemediation, getActionDef } from '@/lib/remediation';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(req: Request) {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { actionType?: string; resourceIds?: string[]; confirm?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  // Confirmation gate — the user must type exactly "valider"
  if ((body.confirm ?? '').trim().toLowerCase() !== 'valider') {
    return NextResponse.json({ error: 'Confirmation requise : tapez « valider »' }, { status: 400 });
  }

  const { actionType, resourceIds } = body;
  if (!actionType || !getActionDef(actionType)) {
    return NextResponse.json({ error: 'Action de remédiation inconnue' }, { status: 400 });
  }
  if (!Array.isArray(resourceIds) || resourceIds.length === 0) {
    return NextResponse.json({ error: 'Aucune ressource sélectionnée' }, { status: 400 });
  }

  try {
    const outcome = await executeRemediation(actionType, resourceIds);
    const succeeded = outcome.results.filter(r => r.ok).length;
    const failed = outcome.results.length - succeeded;
    return NextResponse.json({ ...outcome, succeeded, failed });
  } catch (error) {
    console.error('Remediation execution error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Execution failed' }, { status: 500 });
  }
}
