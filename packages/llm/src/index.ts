import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"

export interface LLMRequest {
  system: string
  prompt: string
  model?: string
}

export async function runLLMRequest({ system, prompt, model }: LLMRequest): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY

  if (apiKey) {
    const client = createOpenAI({ apiKey })
    const result = await generateText({
      model: client(model ?? "gpt-4o"),
      system,
      prompt,
    })
    return result.text
  }

  const fallback = await generateText({
    model: model ?? "openai/gpt-4o",
    system,
    prompt,
  })
  return fallback.text
}
