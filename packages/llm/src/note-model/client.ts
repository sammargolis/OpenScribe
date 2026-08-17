/**
 * Note-generation model wrapper.
 *
 * This is the only entry point the note-generation service uses. It owns
 * provider selection, client initialization, and request execution, so
 * packages/pipeline/note-core never touches a provider SDK directly.
 */

import { DEFAULT_ANTHROPIC_MODEL, runAnthropicCompletion } from "../providers/anthropic"
import { runOpenAICompatibleCompletion } from "../providers/openai-compatible"
import { resolveNoteModelConfig, type NoteModelConfig } from "./config"

export interface NoteCompletionInput {
  system: string
  prompt: string
  /**
   * Model the caller would like to use (the prompt version's default).
   * NOTE_MODEL_NAME wins over this when set.
   */
  model?: string
  /**
   * Credential injected by the host app (getAnthropicApiKey()).
   * Only used by the default Anthropic transport; third-party endpoints
   * require their own NOTE_MODEL_API_KEY.
   */
  apiKey?: string
  /** Pre-resolved config. Defaults to resolveNoteModelConfig() over process.env. */
  config?: NoteModelConfig
}

export interface NoteResult {
  /** Raw model output; the note service handles markdown extraction. */
  text: string
  provider: string
  model: string
}

function firstNonEmpty(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value
    }
  }
  return undefined
}

/**
 * Execute one note-generation completion against the configured provider.
 *
 * Errors are surfaced unchanged so the note service can keep mapping them to
 * its existing `note_generation_error` pipeline error.
 */
export async function generateNoteCompletion(input: NoteCompletionInput): Promise<NoteResult> {
  const { system, prompt } = input
  const config = input.config ?? resolveNoteModelConfig()

  if (config.transport === "anthropic") {
    const model = firstNonEmpty(config.model, input.model) ?? DEFAULT_ANTHROPIC_MODEL
    const text = await runAnthropicCompletion({
      system,
      prompt,
      model,
      apiKey: firstNonEmpty(input.apiKey, config.apiKey),
      ...(config.baseUrl ? { baseUrl: config.baseUrl } : {}),
    })

    return { text, provider: config.provider, model }
  }

  const text = await runOpenAICompatibleCompletion({
    system,
    prompt,
    model: config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  })

  return { text, provider: config.provider, model: config.model }
}
