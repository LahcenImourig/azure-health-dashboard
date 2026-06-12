import { getCredential, queryResourceGraph } from '@/lib/azure-client';

export type RemediationRisk = 'low' | 'medium' | 'high';
export type RemediationCategory = 'cost' | 'cleanup' | 'security';

export interface CandidateResource {
  id: string;
  name: string;
  type: string;
  resourceGroup: string;
  subscriptionId: string;
  detail?: string;
  estimatedMonthlyUsd?: number;
  script: string;
}

export interface RemediationActionDef {
  type: string;
  label: string;
  description: string;
  risk: RemediationRisk;
  category: RemediationCategory;
  // Resource Graph query returning candidate rows
  discoverQuery: string;
  // ARM REST mutation applied per resource
  method: 'DELETE' | 'POST';
  apiVersion: string;
  actionPath?: string; // appended to the resource id (e.g. '/deallocate')
  // Build per-resource fields from a raw RG row
  build: (row: RawRow) => Omit<CandidateResource, 'script'>;
  script: (row: CandidateResource) => string;
}

interface RawRow {
  id?: string;
  name?: string;
  type?: string;
  resourceGroup?: string;
  subscriptionId?: string;
  sizeGb?: number;
  sku?: string;
}

// Rough managed-disk monthly $/GB by SKU family
function diskMonthlyUsd(sizeGb: number, sku: string): number {
  const rate = /premium/i.test(sku) ? 0.12 : /standardssd/i.test(sku) ? 0.075 : 0.045;
  return Math.round(sizeGb * rate * 100) / 100;
}

export const REMEDIATION_ACTIONS: RemediationActionDef[] = [
  {
    type: 'delete-unattached-disk',
    label: 'Supprimer les disques managés non rattachés',
    description: "Disques dont l'état est « Unattached » — ils ne sont reliés à aucune VM et sont facturés à vide.",
    risk: 'medium',
    category: 'cost',
    method: 'DELETE',
    apiVersion: '2023-04-02',
    discoverQuery: `
      Resources
      | where type == 'microsoft.compute/disks'
      | where tostring(properties.diskState) == 'Unattached'
      | project id, name, type, resourceGroup, subscriptionId, sizeGb=toint(properties.diskSizeGB), sku=tostring(sku.name)
      | limit 500`,
    build: (r) => ({
      id: r.id ?? '', name: r.name ?? '?', type: r.type ?? '', resourceGroup: r.resourceGroup ?? '',
      subscriptionId: r.subscriptionId ?? '',
      detail: `${r.sizeGb ?? '?'} Go · ${r.sku ?? '?'}`,
      estimatedMonthlyUsd: diskMonthlyUsd(r.sizeGb ?? 0, r.sku ?? ''),
    }),
    script: (c) => `az disk delete --ids ${c.id} --yes`,
  },
  {
    type: 'release-unused-public-ip',
    label: 'Libérer les IP publiques inutilisées',
    description: "Adresses IP publiques non associées à une ressource (ni NIC, ni NAT Gateway, ni Load Balancer).",
    risk: 'low',
    category: 'cost',
    method: 'DELETE',
    apiVersion: '2023-09-01',
    discoverQuery: `
      Resources
      | where type == 'microsoft.network/publicipaddresses'
      | where isnull(properties.ipConfiguration) and isnull(properties.natGateway)
      | project id, name, type, resourceGroup, subscriptionId, sku=tostring(sku.name)
      | limit 500`,
    build: (r) => ({
      id: r.id ?? '', name: r.name ?? '?', type: r.type ?? '', resourceGroup: r.resourceGroup ?? '',
      subscriptionId: r.subscriptionId ?? '',
      detail: `${r.sku ?? 'Basic'} SKU`,
      estimatedMonthlyUsd: /standard/i.test(r.sku ?? '') ? 3.65 : 2.6,
    }),
    script: (c) => `az network public-ip delete --ids ${c.id}`,
  },
  {
    type: 'delete-orphaned-nic',
    label: 'Supprimer les interfaces réseau orphelines',
    description: "NICs non rattachées à une VM ni à un private endpoint.",
    risk: 'low',
    category: 'cleanup',
    method: 'DELETE',
    apiVersion: '2023-09-01',
    discoverQuery: `
      Resources
      | where type == 'microsoft.network/networkinterfaces'
      | where isnull(properties.virtualMachine) and isnull(properties.privateEndpoint)
      | project id, name, type, resourceGroup, subscriptionId
      | limit 500`,
    build: (r) => ({
      id: r.id ?? '', name: r.name ?? '?', type: r.type ?? '', resourceGroup: r.resourceGroup ?? '',
      subscriptionId: r.subscriptionId ?? '',
    }),
    script: (c) => `az network nic delete --ids ${c.id}`,
  },
];

export function getActionDef(type: string): RemediationActionDef | undefined {
  return REMEDIATION_ACTIONS.find(a => a.type === type);
}

export interface DiscoveredAction {
  type: string;
  label: string;
  description: string;
  risk: RemediationRisk;
  category: RemediationCategory;
  count: number;
  estimatedMonthlyUsd: number;
  resources: CandidateResource[];
}

export async function discoverAction(def: RemediationActionDef, subNameMap: Record<string, string>): Promise<DiscoveredAction> {
  const rows = await queryResourceGraph(def.discoverQuery) as RawRow[];
  const resources: CandidateResource[] = rows.map(r => {
    const base = def.build(r);
    const c: CandidateResource = { ...base, script: '' };
    c.script = def.script(c);
    return c;
  });
  const estimatedMonthlyUsd = Math.round(resources.reduce((s, r) => s + (r.estimatedMonthlyUsd ?? 0), 0) * 100) / 100;
  return {
    type: def.type, label: def.label, description: def.description, risk: def.risk, category: def.category,
    count: resources.length, estimatedMonthlyUsd, resources,
  };
}

export async function discoverAllActions(subNameMap: Record<string, string>): Promise<DiscoveredAction[]> {
  return Promise.all(REMEDIATION_ACTIONS.map(def => discoverAction(def, subNameMap)));
}

export interface ExecutionResult {
  id: string;
  name: string;
  ok: boolean;
  status?: number;
  error?: string;
}

// Execute a typed remediation against a single resource via ARM REST (using the SP token).
async function armMutate(def: RemediationActionDef, resourceId: string): Promise<ExecutionResult> {
  const name = resourceId.split('/').pop() ?? resourceId;
  try {
    const token = await getCredential().getToken('https://management.azure.com/.default');
    const url = `https://management.azure.com${resourceId}${def.actionPath ?? ''}?api-version=${def.apiVersion}`;
    const res = await fetch(url, { method: def.method, headers: { Authorization: `Bearer ${token.token}` } });
    if (res.ok || res.status === 202 || res.status === 204) {
      return { id: resourceId, name, ok: true, status: res.status };
    }
    let msg = `HTTP ${res.status}`;
    try { const body = await res.json(); msg = body?.error?.message ?? msg; } catch { /* ignore */ }
    return { id: resourceId, name, ok: false, status: res.status, error: msg };
  } catch (e) {
    return { id: resourceId, name, ok: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export interface ExecuteOutcome {
  executed: boolean;     // false = simulation (REMEDIATION_ENABLED not set)
  results: ExecutionResult[];
}

export async function executeRemediation(actionType: string, resourceIds: string[]): Promise<ExecuteOutcome> {
  const def = getActionDef(actionType);
  if (!def) throw new Error(`Unknown remediation action: ${actionType}`);

  const enabled = process.env.REMEDIATION_ENABLED === 'true';
  if (!enabled) {
    // Simulation: report what *would* happen without touching Azure
    return {
      executed: false,
      results: resourceIds.map(id => ({ id, name: id.split('/').pop() ?? id, ok: true })),
    };
  }

  // Real execution — capped for safety
  const capped = resourceIds.slice(0, 100);
  const results: ExecutionResult[] = [];
  for (const id of capped) {
    results.push(await armMutate(def, id));
  }
  return { executed: true, results };
}
