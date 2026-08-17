import Anthropic from "@anthropic-ai/sdk"
import { assertSecureEndpoint } from "./endpoint-security"

export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-5-20250929"
export const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com"
const DEFAULT_MAX_TOKENS = 4096
const DEFAULT_TIMEOUT_MS = 45_000

export interface AnthropicCompletionRequest {
  system: string
  prompt: string
  model?: string
  apiKey?: string
  /** Optional override for the Anthropic endpoint (proxy / gateway). */
  baseUrl?: string
  maxTokens?: number
  timeoutMs?: number
}

/**
 * Resolve the Anthropic key from the caller-injected value first (the desktop
 * app injects it via getAnthropicApiKey()), then the environment.
 */
function resolveAnthropicApiKey(apiKey?: string): string {
  const candidate = (apiKey || process.env.ANTHROPIC_API_KEY || "").trim()
  const normalized = candidate.toLowerCase()
  const looksPlaceholder =
    !candidate ||
    normalized.includes("your_key") ||
    normalized.includes("your-key") ||
    normalized.includes("placeholder")

  if (looksPlaceholder) {
    throw new Error("ANTHROPIC_API_KEY is required. " + "Please configure it in Settings.")
  }

  return candidate
}

/**
 * HIPAA Compliance: Validate that the Anthropic SDK uses HTTPS.
 * The SDK defaults to https://api.anthropic.com, but it also honours
 * ANTHROPIC_BASE_URL, so we validate whatever the client actually resolved to
 * before any PHI is sent.
 */
function validateAnthropicHttps(client: Anthropic): void {
  const baseURL = (client as Anthropic & { baseURL?: string }).baseURL || DEFAULT_ANTHROPIC_BASE_URL
  assertSecureEndpoint(baseURL, "Anthropic API endpoint")
}

/**
 * Single-turn completion against the Anthropic Messages API.
 * This is the default (and historical) note-generation transport.
 */
export async function runAnthropicCompletion(request: AnthropicCompletionRequest): Promise<string> {
  const {
    system,
    prompt,
    model,
    apiKey,
    baseUrl,
    maxTokens = DEFAULT_MAX_TOKENS,
    timeoutMs = Number(process.env.ANTHROPIC_TIMEOUT_MS || DEFAULT_TIMEOUT_MS),
  } = request

  const anthropicApiKey = resolveAnthropicApiKey(apiKey)
  const resolvedModel = model ?? DEFAULT_ANTHROPIC_MODEL

  if (baseUrl) {
    // Fail fast with the caller-facing label before the SDK swallows the value.
    assertSecureEndpoint(baseUrl, "Anthropic API endpoint")
  }

  const client = new Anthropic({
    apiKey: anthropicApiKey,
    ...(baseUrl ? { baseURL: baseUrl } : {}),
  })

  // Validate HTTPS before sending any PHI
  validateAnthropicHttps(client)

  const requestParams: Anthropic.MessageCreateParams = {
    model: resolvedModel,
    max_tokens: maxTokens,
    system: system,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  }

  let timer: ReturnType<typeof setTimeout> | null = null
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Anthropic request timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  let message: Awaited<ReturnType<typeof client.messages.create>>
  try {
    message = await Promise.race([client.messages.create(requestParams), timeoutPromise])
  } finally {
    if (timer) clearTimeout(timer)
  }

  // Extract text content from response
  const textContent = message.content.find((block) => block.type === "text")
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in Anthropic response")
  }

  return textContent.text
}
