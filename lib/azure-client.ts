import { ClientSecretCredential } from '@azure/identity';
import { AdvisorManagementClient } from '@azure/arm-advisor';
import { CostManagementClient } from '@azure/arm-costmanagement';
import { MicrosoftResourceHealth } from '@azure/arm-resourcehealth';
import { LogsQueryClient } from '@azure/monitor-query';
import { SubscriptionClient } from '@azure/arm-subscriptions';
import { ResourceGraphClient } from '@azure/arm-resourcegraph';

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

let _credential: ClientSecretCredential | null = null;

export function getCredential(): ClientSecretCredential {
  if (!_credential) {
    _credential = new ClientSecretCredential(
      requireEnv('AZURE_TENANT_ID'),
      requireEnv('AZURE_CLIENT_ID'),
      requireEnv('AZURE_CLIENT_SECRET')
    );
  }
  return _credential;
}

export interface AzureSubscription {
  id: string;
  displayName: string;
  state: string;
}

let _subscriptions: AzureSubscription[] | null = null;

export async function getAllSubscriptions(): Promise<AzureSubscription[]> {
  if (_subscriptions) return _subscriptions;

  const client = new SubscriptionClient(getCredential());
  const subs: AzureSubscription[] = [];

  for await (const sub of client.subscriptions.list()) {
    if (sub.state === 'Enabled' && sub.subscriptionId) {
      subs.push({
        id: sub.subscriptionId,
        displayName: sub.displayName ?? sub.subscriptionId,
        state: sub.state,
      });
    }
  }

  _subscriptions = subs;
  return subs;
}

export async function getAllSubscriptionIds(): Promise<string[]> {
  const subs = await getAllSubscriptions();
  return subs.map(s => s.id);
}

export function getAdvisorClient(subscriptionId: string): AdvisorManagementClient {
  return new AdvisorManagementClient(getCredential(), subscriptionId);
}

export function getCostManagementClient(): CostManagementClient {
  return new CostManagementClient(getCredential());
}

export function getResourceHealthClient(subscriptionId: string): MicrosoftResourceHealth {
  return new MicrosoftResourceHealth(getCredential(), subscriptionId);
}

export function getLogsQueryClient(): LogsQueryClient {
  return new LogsQueryClient(getCredential());
}

export async function queryResourceGraph(query: string, subscriptionIds?: string[]): Promise<unknown[]> {
  const client = new ResourceGraphClient(getCredential());
  const subs = subscriptionIds ?? await getAllSubscriptionIds();

  // Resource Graph supports up to 1000 subscriptions per call
  const BATCH = 1000;
  const results: unknown[] = [];

  for (let i = 0; i < subs.length; i += BATCH) {
    const batch = subs.slice(i, i + BATCH);
    const result = await client.resources({ subscriptions: batch, query });
    results.push(...((result.data as unknown[]) ?? []));
  }

  return results;
}
