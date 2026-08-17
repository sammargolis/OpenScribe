import { DEFAULT_ANTHROPIC_MODEL, runAnthropicCompletion } from "./providers/anthropic"

export interface LLMRequest {
  system: string
  prompt: string
  model?: string
  apiKey?: string
  /** Optional Anthropic endpoint override. Must be HTTPS (or loopback). */
  baseUrl?: string
  /**
   * @deprecated JSON schema tool calling is no longer used.
   * The system now generates markdown directly.
   */
  jsonSchema?: {
    name: string
    schema: Record<string, unknown>
  }
}

/**
 * Direct Anthropic completion.
 *
 * Kept for callers that are explicitly Anthropic-bound. Note generation goes
 * through generateNoteCompletion() instead, which is provider-configurable.
 */
export async function runLLMRequest({ system, prompt, model, apiKey, baseUrl, jsonSchema }: LLMRequest): Promise<string> {
  // JSON schema is deprecated - we now generate markdown directly
  if (jsonSchema) {
    console.warn("⚠️  jsonSchema parameter is deprecated and will be ignored. The system now generates markdown directly.")
  }

  return runAnthropicCompletion({
    system,
    prompt,
    model: model ?? DEFAULT_ANTHROPIC_MODEL,
    apiKey,
    baseUrl,
  })
}

// Provider transports (note generation picks one of these via config)
export { DEFAULT_ANTHROPIC_BASE_URL, DEFAULT_ANTHROPIC_MODEL, runAnthropicCompletion } from "./providers/anthropic"
export type { AnthropicCompletionRequest } from "./providers/anthropic"
export { runOpenAICompatibleCompletion } from "./providers/openai-compatible"
export type { OpenAICompatibleCompletionRequest } from "./providers/openai-compatible"
export { assertSecureEndpoint, isLoopbackHostname } from "./providers/endpoint-security"

// Provider-configurable note generation wrapper
export * from "./note-model"

// Export prompts for versioned prompt management
export * as prompts from "./prompts"
