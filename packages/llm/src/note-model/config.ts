/**
 * Note-generation model configuration.
 *
 * Note generation is the only LLM call that is provider-configurable. The
 * config is resolved purely from environment variables so switching providers
 * never requires a code change:
 *
 *   NOTE_MODEL_PROVIDER  provider id (default: "anthropic")
 *   NOTE_MODEL_BASE_URL  endpoint override / required for unknown providers
 *   NOTE_MODEL_API_KEY   credential (required for non-default providers)
 *   NOTE_MODEL_NAME      model id (required for non-default providers)
 *
 * With none of these set the resolved config is the historical Anthropic path.
 */

import { assertSecureEndpoint } from "../providers/endpoint-security"

export const DEFAULT_NOTE_MODEL_PROVIDER = "anthropic"

export const NOTE_MODEL_ENV_KEYS = {
  provider: "NOTE_MODEL_PROVIDER",
  baseUrl: "NOTE_MODEL_BASE_URL",
  apiKey: "NOTE_MODEL_API_KEY",
  model: "NOTE_MODEL_NAME",
} as const

/**
 * Transports the wrapper knows how to execute. `anthropic` is the native SDK
 * path; every other provider id is treated as an OpenAI SDK-compatible
 * `/chat/completions` endpoint.
 */
export type NoteModelTransport = "anthropic" | "openai-compatible"

export interface AnthropicNoteModelConfig {
  provider: string
  transport: "anthropic"
  /** Only set when NOTE_MODEL_NAME overrides the prompt's default model. */
  model?: string
  baseUrl?: string
  /** Only set when NOTE_MODEL_API_KEY is provided; the host app's injected key wins. */
  apiKey?: string
}

export interface OpenAICompatibleNoteModelConfig {
  provider: string
  transport: "openai-compatible"
  model: string
  baseUrl: string
  apiKey: string
}

export type NoteModelConfig = AnthropicNoteModelConfig | OpenAICompatibleNoteModelConfig

export type NoteModelEnv = Record<string, string | undefined>

/**
 * Endpoints we can fill in for well-known OpenAI-compatible providers so that
 * NOTE_MODEL_BASE_URL is optional for them. Anything not listed here must
 * supply NOTE_MODEL_BASE_URL explicitly.
 */
const KNOWN_OPENAI_COMPATIBLE_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
}

function readEnv(env: NoteModelEnv, key: string): string | undefined {
  const value = env[key]
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

export function isDefaultNoteModelProvider(provider: string): boolean {
  return provider === DEFAULT_NOTE_MODEL_PROVIDER
}

/**
 * Resolve the note-generation model config from the environment.
 *
 * @throws when a non-default provider is selected without the values it needs,
 *         or when the configured endpoint would send PHI over plaintext HTTP.
 */
export function resolveNoteModelConfig(env: NoteModelEnv = process.env): NoteModelConfig {
  const provider = (readEnv(env, NOTE_MODEL_ENV_KEYS.provider) ?? DEFAULT_NOTE_MODEL_PROVIDER).toLowerCase()
  const model = readEnv(env, NOTE_MODEL_ENV_KEYS.model)
  const apiKey = readEnv(env, NOTE_MODEL_ENV_KEYS.apiKey)
  const baseUrl = readEnv(env, NOTE_MODEL_ENV_KEYS.baseUrl)

  if (baseUrl) {
    // HIPAA: reject plaintext endpoints (loopback excepted) before any PHI flows.
    assertSecureEndpoint(baseUrl, NOTE_MODEL_ENV_KEYS.baseUrl)
  }

  if (isDefaultNoteModelProvider(provider)) {
    // Default path: everything stays optional so behavior is unchanged.
    return {
      provider,
      transport: "anthropic",
      ...(model ? { model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
      ...(apiKey ? { apiKey } : {}),
    }
  }

  const resolvedBaseUrl = baseUrl ?? KNOWN_OPENAI_COMPATIBLE_BASE_URLS[provider]

  if (!resolvedBaseUrl) {
    throw new Error(
      `${NOTE_MODEL_ENV_KEYS.baseUrl} is required when ${NOTE_MODEL_ENV_KEYS.provider} is "${provider}". ` +
        `No built-in endpoint is known for that provider.`,
    )
  }

  if (!model) {
    throw new Error(
      `${NOTE_MODEL_ENV_KEYS.model} is required when ${NOTE_MODEL_ENV_KEYS.provider} is "${provider}".`,
    )
  }

  if (!apiKey) {
    // The default path injects an Anthropic key; a third-party endpoint must
    // never receive it, so a provider-specific credential is mandatory.
    throw new Error(
      `${NOTE_MODEL_ENV_KEYS.apiKey} is required when ${NOTE_MODEL_ENV_KEYS.provider} is "${provider}".`,
    )
  }

  return {
    provider,
    transport: "openai-compatible",
    model,
    baseUrl: resolvedBaseUrl,
    apiKey,
  }
}
