/**
 * OpenAI SDK-compatible chat completions transport.
 *
 * Implemented with `fetch` against the `POST {baseUrl}/chat/completions`
 * contract rather than the official `openai` npm package: OpenScribe ships an
 * offline/desktop build and adding a runtime dependency is out of scope for
 * this change. The request/response mapping is intentionally isolated in this
 * one file, so swapping in `new OpenAI({ baseURL, apiKey }).chat.completions`
 * later is a single-file replacement with no changes to callers.
 */

import { assertSecureEndpoint } from "./endpoint-security"

const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_TIMEOUT_MS = 45_000

export interface OpenAICompatibleCompletionRequest {
  system: string
  prompt: string
  model: string
  baseUrl: string
  apiKey?: string
  maxTokens?: number
  timeoutMs?: number
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string | Array<{ type?: string; text?: string }> }
    text?: string
  }>
}

interface ChatCompletionErrorResponse {
  error?: { code?: string; type?: string }
}

function assertNonEmpty(value: string | undefined, label: string): asserts value is string {
  if (!value || value.trim().length === 0) {
    throw new Error(`${label} is required`)
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl
}

/**
 * Flatten the content field, which is a plain string on OpenAI itself and an
 * array of content parts on several compatible gateways.
 */
function extractContent(payload: ChatCompletionResponse): string {
  const choice = payload.choices?.[0]
  const content = choice?.message?.content

  if (typeof content === "string") {
    return content
  }

  if (Array.isArray(content)) {
    return content
      .filter((part) => part && (part.type === undefined || part.type === "text"))
      .map((part) => part.text ?? "")
      .join("")
  }

  return choice?.text ?? ""
}

/**
 * Build a failure message from status metadata only.
 *
 * HIPAA Compliance: response bodies from chat completion endpoints routinely
 * echo the submitted messages back (validation errors, moderation errors), and
 * this message is surfaced to audit logs, so the raw body is never included.
 * Only the provider's machine-readable error code/type is attached.
 */
async function describeFailure(response: Response): Promise<string> {
  let code = ""
  try {
    const body = (await response.json()) as ChatCompletionErrorResponse
    code = body?.error?.code || body?.error?.type || ""
  } catch {
    code = ""
  }

  const suffix = code ? ` (${code})` : ""
  return `Note model request failed: ${response.status} ${response.statusText || "error"}${suffix}`
}

export async function runOpenAICompatibleCompletion(
  request: OpenAICompatibleCompletionRequest,
): Promise<string> {
  const {
    system,
    prompt,
    model,
    baseUrl,
    apiKey,
    maxTokens = DEFAULT_MAX_TOKENS,
    timeoutMs = Number(process.env.NOTE_MODEL_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  } = request

  assertNonEmpty(system, "system")
  assertNonEmpty(prompt, "prompt")
  assertNonEmpty(model, "model")
  assertNonEmpty(baseUrl, "baseUrl")

  // Validate HTTPS (or explicit loopback) before sending any PHI.
  assertSecureEndpoint(baseUrl, "NOTE_MODEL_BASE_URL")

  const url = `${normalizeBaseUrl(baseUrl)}/chat/completions`
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(url, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
        stream: false,
      }),
    })
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Note model request timed out after ${timeoutMs}ms`)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    throw new Error(await describeFailure(response))
  }

  const payload = (await response.json()) as ChatCompletionResponse
  const content = extractContent(payload)

  if (!content) {
    throw new Error("No text content in note model response")
  }

  return content
}
