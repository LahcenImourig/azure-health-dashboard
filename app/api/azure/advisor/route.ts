import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { getAllSubscriptions, getAdvisorClient } from '@/lib/azure-client';
import type { AdvisorRecommendation, AdvisorCategory } from '@/types/azure';

function buildPortalUrl(resourceId: string): string {
  return `https://portal.azure.com/#resource${resourceId}`;
}

function parseResourceParts(resourceId: string) {
  const parts = resourceId.split('/');
  return {
    subscriptionId: parts[2] ?? '',
    resourceGroup: parts[4] ?? 'Unknown',
    resourceType: parts.slice(6, parts.length - 1).join('/') || (parts[6] ?? 'Unknown'),
    resourceName: parts[parts.length - 1] ?? 'Unknown',
  };
}

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const subscriptions = await getAllSubscriptions();
    const allRecs: AdvisorRecommendation[] = [];

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          const client = getAdvisorClient(sub.id);
          for await (const rec of client.recommendations.list()) {
            const resourceId = rec.resourceMetadata?.resourceId ?? '';
            const parsed = parseResourceParts(resourceId);

            allRecs.push({
              id: rec.id ?? crypto.randomUUID(),
              category: (rec.category ?? 'OperationalExcellence') as AdvisorCategory,
              impact: (rec.impact ?? 'Low') as 'High' | 'Medium' | 'Low',
              title: rec.shortDescription?.solution ?? 'Advisor Recommendation',
              description: rec.shortDescription?.problem ?? '',
              resourceGroup: parsed.resourceGroup,
              resourceType: (rec.impactedField ?? parsed.resourceType) || 'Unknown',
              resourceName: (rec.impactedValue ?? parsed.resourceName) || 'Unknown',
              resourceId: resourceId || undefined,
              portalUrl: resourceId ? buildPortalUrl(resourceId) : undefined,
              potentialSavingsUsd: rec.extendedProperties?.['savingsAmount']
                ? parseFloat(rec.extendedProperties['savingsAmount'])
                : undefined,
              lastUpdated: rec.lastUpdated?.toISOString() ?? new Date().toISOString(),
              subscriptionId: sub.id,
              subscriptionName: sub.displayName,
            });
          }
        } catch (e) {
          console.warn(`Advisor fetch failed for subscription ${sub.displayName}:`, e);
        }
      })
    );

    allRecs.sort((a, b) => {
      const impactOrder = { High: 0, Medium: 1, Low: 2 };
      return impactOrder[a.impact] - impactOrder[b.impact];
    });

    return NextResponse.json(allRecs);
  } catch (error) {
    console.error('Advisor API error:', error);
    return NextResponse.json({ error: 'Failed to fetch advisor data' }, { status: 500 });
  }
}
