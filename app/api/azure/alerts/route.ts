import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { queryResourceGraph, getAllSubscriptions } from '@/lib/azure-client';
import type { AlertRule, Severity } from '@/types/azure';

interface AlertRow {
  id?: string;
  subscriptionId?: string;
  name?: string;
  properties?: {
    essentials?: {
      alertRule?: string;
      severity?: string;
      alertState?: string;
      monitorCondition?: string;
      targetResourceName?: string;
      targetResourceGroup?: string;
      targetResourceType?: string;
      targetResourceIds?: string[];
      description?: string;
      monitorService?: string;
      firedDateTime?: string;
    };
  };
}

const SEVERITY_MAP: Record<string, Severity> = {
  Sev0: 'Critical', Sev1: 'Error', Sev2: 'Warning', Sev3: 'Informational', Sev4: 'Informational',
};

function buildPortalUrl(resourceId: string): string {
  return `https://portal.azure.com/#resource${resourceId}`;
}

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const subscriptions = await getAllSubscriptions();
    const subscriptionIds = subscriptions.map(s => s.id);
    const subNameMap = Object.fromEntries(subscriptions.map(s => [s.id, s.displayName]));

    const rows = await queryResourceGraph(`
      AlertsManagementResources
      | where type == "microsoft.alertsmanagement/alerts"
      | where properties.essentials.alertState in ("New", "Acknowledged")
      | where properties.essentials.monitorCondition == "Fired"
      | project id, subscriptionId, name, properties
      | order by todatetime(properties.essentials.firedDateTime) desc
      | limit 200
    `, subscriptionIds) as AlertRow[];

    const alerts: AlertRule[] = rows.map(row => {
      const ess = row.properties?.essentials ?? {};
      const resourceGroup = ess.targetResourceGroup ?? '';
      const resourceName = ess.targetResourceName ?? '';
      const resourceType = ess.targetResourceType ?? '';
      const subId = row.subscriptionId ?? '';

      // Prefer explicit resourceId, else construct from parts
      let resourceId = ess.targetResourceIds?.[0] ?? '';
      if (!resourceId && subId && resourceGroup && resourceType && resourceName) {
        resourceId = `/subscriptions/${subId}/resourceGroups/${resourceGroup}/providers/${resourceType}/${resourceName}`;
      }

      return {
        id: row.id ?? crypto.randomUUID(),
        name: ess.alertRule ?? row.name ?? 'Unknown Alert',
        severity: SEVERITY_MAP[ess.severity ?? 'Sev3'] ?? 'Informational',
        status: 'Fired' as const,
        firedTime: ess.firedDateTime ?? new Date().toISOString(),
        resourceGroup: resourceGroup || 'Unknown',
        resourceName: resourceName || 'Unknown',
        resourceType: resourceType || undefined,
        resourceId: resourceId || undefined,
        portalUrl: resourceId ? buildPortalUrl(resourceId) : undefined,
        description: ess.description ?? '',
        monitorService: ess.monitorService ?? 'Azure Monitor',
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionId ? subNameMap[row.subscriptionId] : undefined,
      };
    });

    return NextResponse.json(alerts);
  } catch (error) {
    console.error('Alerts API error:', error);
    return NextResponse.json({ error: 'Failed to fetch alerts data' }, { status: 500 });
  }
}
