import Anthropic from "@anthropic-ai/sdk"

export interface LLMRequest {
  system: string
  prompt: string
  model?: string
  /**
   * @deprecated JSON schema tool calling is no longer used.
   * The system now generates markdown directly.
   */
  jsonSchema?: {
    name: string
    schema: Record<string, unknown>
  }
}

export async function runLLMRequest({ system, prompt, model, jsonSchema }: LLMRequest): Promise<string> {
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY
  
  if (!anthropicApiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY environment variable is required. " +
      "Please set it in your .env.local file or environment."
    )
  }

  const defaultModel = "claude-sonnet-4-5-20250929"
  const resolvedModel = model ?? defaultModel

  const client = new Anthropic({
    apiKey: anthropicApiKey,
  })

  // Build request parameters
  const requestParams: Anthropic.MessageCreateParams = {
    model: resolvedModel,
    max_tokens: 4096,
    system: system,
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  }

  // JSON schema is deprecated - we now generate markdown directly
  if (jsonSchema) {
    console.warn("⚠️  jsonSchema parameter is deprecated and will be ignored. The system now generates markdown directly.")
  }

  const message = await client.messages.create(requestParams)

  // Extract text content from response
  const textContent = message.content.find((block) => block.type === "text")
  if (!textContent || textContent.type !== "text") {
    throw new Error("No text content in Anthropic response")
  }

  return textContent.text
}

// Export prompts for versioned prompt management
export * as prompts from "./prompts"

