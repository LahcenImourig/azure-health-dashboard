import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getAllSubscriptions } from '@/lib/azure-client';

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const subs = await getAllSubscriptions();
    return NextResponse.json(subs);
  } catch (error) {
    console.error('Subscriptions API error:', error);
    return NextResponse.json({ error: 'Failed to list subscriptions' }, { status: 500 });
  }
}
