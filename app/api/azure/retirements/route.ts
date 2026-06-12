import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-guard';
import { queryResourceGraph, getAllSubscriptions } from '@/lib/azure-client';
import type { RetirementNotice, AffectedResource } from '@/types/azure';

interface ImpactedResourceEntry {
  TargetedResourceId?: string;
  TargetedResourceType?: string;
  Status?: string;
}

interface ImpactedRegion {
  ImpactedRegion?: string;
  Status?: string;
}

interface ImpactEntry {
  ImpactedService?: string;
  ImpactedResources?: ImpactedResourceEntry[];
  ImpactedRegions?: ImpactedRegion[];
}

// Row from microsoft.resourcehealth/events/impactedresources
interface ImpactedResourceRow {
  id?: string;
  subscriptionId?: string;
  properties?: {
    targetResourceId?: string;
    targetResourceType?: string;
    resourceName?: string;
    resourceGroup?: string;
    targetRegion?: string;
  };
}

interface RetirementRow {
  id?: string;
  subscriptionId?: string;
  name?: string;
  properties?: {
    EventType?: string;
    EventSubType?: string;
    Status?: string;
    Title?: string;
    Header?: string;
    Summary?: string;
    Description?: string;
    TrackingId?: string;
    ImpactMitigationTime?: number;
    LastUpdateTime?: number;
    Impact?: ImpactEntry[];
    RecommendedActions?: {
      Message?: string;
      Actions?: Array<{ ActionText?: string; ActionUrl?: string }>;
    };
  };
}

// Map an impacted Azure service (and title keywords) to candidate ARM resource types.
// Lets us infer which of the customer's real resources a retirement advisory concerns,
// since Azure scopes these advisories to service+subscription, not individual resources.
const SERVICE_TYPE_MAP: Record<string, string[]> = {
  'vpn gateway': ['microsoft.network/virtualnetworkgateways'],
  'azure database for postgresql': ['microsoft.dbforpostgresql/servers', 'microsoft.dbforpostgresql/flexibleservers'],
  'azure database for mysql': ['microsoft.dbformysql/servers', 'microsoft.dbformysql/flexibleservers'],
  'azure monitor': ['microsoft.operationalinsights/workspaces'],
  'functions': ['microsoft.web/sites'],
  'app service': ['microsoft.web/sites'],
  'application insights': ['microsoft.insights/components'],
  'service bus': ['microsoft.servicebus/namespaces'],
  'event hub': ['microsoft.eventhub/namespaces'],
  'azure databricks': ['microsoft.databricks/workspaces'],
  'storage': ['microsoft.storage/storageaccounts'],
  'application gateway': ['microsoft.network/applicationgateways'],
  'azure sentinel': ['microsoft.operationalinsights/workspaces'],
  'load balancer': ['microsoft.network/loadbalancers'],
  'network watcher': ['microsoft.network/networksecuritygroups'],
  'cost management': ['microsoft.compute/virtualmachines'],
  'api management': ['microsoft.apimanagement/service'],
  'virtual machines': ['microsoft.compute/virtualmachines'],
  'kubernetes': ['microsoft.containerservice/managedclusters'],
  'sql': ['microsoft.sql/servers', 'microsoft.sql/servers/databases'],
  'cosmos': ['microsoft.documentdb/databaseaccounts'],
  'redis': ['microsoft.cache/redis'],
  'data factory': ['microsoft.datafactory/factories'],
};

// Keyword → types overrides (matched against the title) for cases the service field misses.
const TITLE_KEYWORD_MAP: Array<{ kw: RegExp; types: string[] }> = [
  { kw: /reserved vm|vm series|virtual machine/i, types: ['microsoft.compute/virtualmachines'] },
  { kw: /api management|apim/i, types: ['microsoft.apimanagement/service'] },
  { kw: /general-purpose v1|storage account/i, types: ['microsoft.storage/storageaccounts'] },
  { kw: /function/i, types: ['microsoft.web/sites'] },
  { kw: /public ip/i, types: ['microsoft.network/publicipaddresses'] },
];

function candidateTypesFor(service: string, title: string): string[] {
  const set = new Set<string>();
  const svc = (service ?? '').toLowerCase();
  for (const [key, types] of Object.entries(SERVICE_TYPE_MAP)) {
    if (svc.includes(key)) types.forEach(t => set.add(t));
  }
  for (const { kw, types } of TITLE_KEYWORD_MAP) {
    if (kw.test(title ?? '')) types.forEach(t => set.add(t));
  }
  return Array.from(set);
}

const SERVICE_HEALTH_ADVISORIES_URL = 'https://portal.azure.com/#view/Microsoft_Azure_Health/AzureHealthBrowseBlade/~/healthAdvisories';

// Find the best Microsoft article link for a retirement: a specific doc link if present
// in the advisory HTML, otherwise the official Azure Service Health advisories page.
function extractArticleUrl(summary?: string, description?: string): string {
  const html = `${summary ?? ''} ${description ?? ''}`;
  const links: string[] = [];
  const re = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) links.push(m[1]);
  const specific = links.find(u => /learn\.microsoft\.com|azure\.microsoft\.com|docs\.microsoft\.com/i.test(u));
  if (specific) return specific;
  const aka = links.find(u => /aka\.ms/i.test(u));
  if (aka) return aka;
  return SERVICE_HEALTH_ADVISORIES_URL;
}

function ticksToIso(ticks?: number): string {
  if (!ticks) return new Date(Date.now() + 90 * 86400000).toISOString();
  const ms = Math.floor(ticks / 10000) - 62135596800000;
  return new Date(ms).toISOString();
}

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(isoDate).getTime() - Date.now()) / 86400000);
}

function parseResource(resourceId: string, subscriptionId?: string, subscriptionName?: string): AffectedResource {
  const parts = resourceId.split('/');
  const name = parts[parts.length - 1] ?? resourceId;
  const type = parts.length >= 8 ? `${parts[6]}/${parts[7]}` : parts[6] ?? 'Unknown';
  const resourceGroup = parts[4] ?? 'Unknown';
  return {
    id: resourceId,
    name,
    type,
    resourceGroup,
    subscriptionId,
    subscriptionName,
    portalUrl: `https://portal.azure.com/#resource${resourceId}`,
  };
}

export async function GET() {
  const { authorized } = await requireAuth();
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const subscriptions = await getAllSubscriptions();
    const subscriptionIds = subscriptions.map(s => s.id);
    const subNameMap = Object.fromEntries(subscriptions.map(s => [s.id, s.displayName]));

    const [rows, impactedRows] = await Promise.all([
      queryResourceGraph(`
        ServiceHealthResources
        | where type == 'microsoft.resourcehealth/events'
        | where properties.EventType == 'HealthAdvisory'
        | where properties.Status == 'Active'
        | where properties.EventSubType == 'Retirement'
        | order by todatetime(properties.LastUpdateTime) desc
        | limit 200
      `, subscriptionIds) as Promise<RetirementRow[]>,
      // Per-resource impact lives in a separate table; join by tracking id (parsed from the id path)
      queryResourceGraph(`
        ServiceHealthResources
        | where type == 'microsoft.resourcehealth/events/impactedresources'
        | project id, subscriptionId, properties
        | limit 1000
      `, subscriptionIds) as Promise<ImpactedResourceRow[]>,
    ]);

    // Index impacted resources by their parent event's tracking id
    const resourcesByTracking = new Map<string, AffectedResource[]>();
    for (const r of impactedRows) {
      const tid = r.id?.split('/events/')[1]?.split('/')[0];
      if (!tid) continue;
      const p = r.properties ?? {};
      const subId = r.subscriptionId ?? p.targetResourceId?.split('/')[2];
      const resource: AffectedResource = {
        id: p.targetResourceId ?? r.id ?? '',
        name: p.resourceName ?? p.targetResourceId?.split('/').pop() ?? 'Unknown',
        type: p.targetResourceType ?? 'Unknown',
        resourceGroup: p.resourceGroup ?? 'Unknown',
        subscriptionId: subId,
        subscriptionName: subId ? subNameMap[subId] : undefined,
        portalUrl: p.targetResourceId ? `https://portal.azure.com/#resource${p.targetResourceId}` : 'https://portal.azure.com',
      };
      const list = resourcesByTracking.get(tid) ?? [];
      list.push(resource);
      resourcesByTracking.set(tid, list);
    }

    // Group by TrackingId — same notice appears once per subscription
    const grouped = new Map<string, { row: RetirementRow; subIds: Set<string> }>();

    for (const row of rows) {
      const p = row.properties ?? {};
      const key = p.TrackingId ?? p.Title ?? p.Header ?? row.id ?? crypto.randomUUID();
      if (!grouped.has(key)) grouped.set(key, { row, subIds: new Set<string>() });
      if (row.subscriptionId) grouped.get(key)!.subIds.add(row.subscriptionId);
    }

    const retirements: RetirementNotice[] = [];
    const pendingInference: Array<{ notice: RetirementNotice; types: string[] }> = [];

    for (const [key, { row, subIds }] of Array.from(grouped)) {
      const p = row.properties ?? {};
      const retirementDate = ticksToIso(p.ImpactMitigationTime);
      const days = daysUntil(retirementDate);
      if (days <= 0) continue;

      // 1) Real resources from the impactedresources table (rare for retirements)
      const fromTable = resourcesByTracking.get(p.TrackingId ?? key) ?? [];
      // 2) Any resources embedded inline in Impact[] (also rare)
      const inline: AffectedResource[] = [];
      for (const impact of p.Impact ?? []) {
        for (const res of impact.ImpactedResources ?? []) {
          if (res.TargetedResourceId) {
            const subId = res.TargetedResourceId.split('/')[2];
            inline.push(parseResource(res.TargetedResourceId, subId, subId ? subNameMap[subId] : undefined));
          }
        }
      }
      const affectedResources = [...fromTable, ...inline];

      // Affected subscriptions (always available) + impacted regions
      const affectedSubscriptions = Array.from(subIds).map(id => ({ id, name: subNameMap[id] ?? id }));
      const regions = Array.from(new Set(
        (p.Impact ?? []).flatMap(i => (i.ImpactedRegions ?? []).map(r => r.ImpactedRegion ?? '')).filter(Boolean)
      ));
      const service = p.Impact?.[0]?.ImpactedService ?? 'Azure';
      const title = p.Title ?? p.Header ?? 'Retirement Notice';

      const notice: RetirementNotice = {
        id: p.TrackingId ?? row.id ?? crypto.randomUUID(),
        title,
        service,
        retirementDate,
        daysUntilRetirement: days,
        impactedResources: affectedResources.length || affectedSubscriptions.length,
        description: p.Summary ?? p.Description ?? '',
        migrationGuideUrl: p.RecommendedActions?.Actions?.[0]?.ActionUrl,
        articleUrl: extractArticleUrl(p.Summary, p.Description),
        affectedResources: affectedResources.length > 0 ? affectedResources : undefined,
        affectedSubscriptions,
        regions,
      };
      retirements.push(notice);

      // Queue type-based inference for notices Azure didn't give explicit resources for
      if (affectedResources.length === 0) {
        const types = candidateTypesFor(service, title);
        if (types.length > 0) pendingInference.push({ notice, types: types.map(t => t.toLowerCase()) });
      }
    }

    // Inference pass: list the customer's real resources of each concerned type
    if (pendingInference.length > 0) {
      const allTypes = Array.from(new Set(pendingInference.flatMap(p => p.types)));
      const typeList = allTypes.map(t => `'${t}'`).join(', ');
      const resourceRows = await queryResourceGraph(`
        Resources
        | where tolower(type) in (${typeList})
        | project id, name, type, resourceGroup, subscriptionId, location
        | limit 2000
      `, subscriptionIds) as Array<{ id?: string; name?: string; type?: string; resourceGroup?: string; subscriptionId?: string; location?: string }>;

      // Bucket resources by lowercase type
      const byType = new Map<string, AffectedResource[]>();
      for (const r of resourceRows) {
        const t = (r.type ?? '').toLowerCase();
        const ar: AffectedResource = {
          id: r.id ?? '',
          name: r.name ?? 'Unknown',
          type: r.type ?? 'Unknown',
          resourceGroup: r.resourceGroup ?? 'Unknown',
          subscriptionId: r.subscriptionId,
          subscriptionName: r.subscriptionId ? subNameMap[r.subscriptionId] : undefined,
          portalUrl: r.id ? `https://portal.azure.com/#resource${r.id}` : 'https://portal.azure.com',
        };
        const list = byType.get(t) ?? [];
        list.push(ar);
        byType.set(t, list);
      }

      for (const { notice, types } of pendingInference) {
        const matched = types.flatMap(t => byType.get(t) ?? []);
        if (matched.length > 0) {
          notice.affectedResources = matched.slice(0, 100);
          notice.resourcesInferred = true;
          notice.impactedResources = matched.length;
        }
      }
    }

    retirements.sort((a, b) => a.daysUntilRetirement - b.daysUntilRetirement);
    return NextResponse.json(retirements);
  } catch (error) {
    console.error('Retirements API error:', error);
    return NextResponse.json({ error: 'Failed to fetch retirement data' }, { status: 500 });
  }
}
