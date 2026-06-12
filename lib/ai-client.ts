import Anthropic from '@anthropic-ai/sdk';
import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';

// Unified client type — both SDKs expose the same `.messages.create` / `.messages.stream` surface.
export type AIClient = Anthropic | AnthropicBedrock;
export type AIProvider = 'bedrock' | 'anthropic';

/**
 * Provider selection:
 * - AI_PROVIDER=bedrock|anthropic forces a provider.
 * - Otherwise: use the Anthropic API if ANTHROPIC_API_KEY is set, else default to Bedrock
 *   (the production target — Claude runs on Amazon Bedrock using the host's IAM role).
 */
export function getAIProvider(): AIProvider {
  const p = (process.env.AI_PROVIDER ?? '').toLowerCase();
  if (p === 'bedrock' || p === 'anthropic') return p as AIProvider;
  return process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'bedrock';
}

/**
 * Bedrock authenticates via the standard AWS credential chain (IAM role on the AWS host,
 * or AWS_ACCESS_KEY_ID/SECRET in env). So on AWS it's always "configured".
 * The Anthropic API path requires an explicit key.
 */
export function isAIConfigured(): boolean {
  return getAIProvider() === 'bedrock' ? true : Boolean(process.env.ANTHROPIC_API_KEY);
}

export function resolveModel(): string {
  if (getAIProvider() === 'bedrock') {
    // Bedrock model IDs carry the `anthropic.` provider prefix. Some accounts/regions
    // require a region-scoped inference profile (e.g. us.anthropic.claude-opus-4-8) —
    // override via BEDROCK_MODEL_ID if needed.
    return process.env.BEDROCK_MODEL_ID ?? 'anthropic.claude-opus-4-8';
  }
  return process.env.AI_MODEL ?? 'claude-opus-4-8';
}

let _client: AIClient | null = null;

export function getAIClient(): AIClient {
  if (_client) return _client;
  if (getAIProvider() === 'bedrock') {
    // Credentials resolved from the default AWS chain (IAM role / env). Region required.
    _client = new AnthropicBedrock({
      awsRegion: process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
    });
  } else {
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

export function aiProviderLabel(): string {
  return getAIProvider() === 'bedrock' ? `Amazon Bedrock (${resolveModel()})` : `Anthropic API (${resolveModel()})`;
}
