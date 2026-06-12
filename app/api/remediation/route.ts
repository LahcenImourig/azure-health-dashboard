import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getAllSubscriptions } from '@/lib/azure-client';
import { discoverAllActions } from '@/lib/remediation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const subscriptions = await getAllSubscriptions();
    const subNameMap = Object.fromEntries(subscriptions.map(s => [s.id, s.displayName]));
    const actions = await discoverAllActions(subNameMap);
    return NextResponse.json({
      actions,
      executionEnabled: process.env.REMEDIATION_ENABLED === 'true',
    });
  } catch (error) {
    console.error('Remediation discovery error:', error);
    return NextResponse.json({ error: 'Failed to discover remediation candidates' }, { status: 500 });
  }
}
