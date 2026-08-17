"use server"

/**
 * OpenClaw planner transport (experimental POC).
 *
 * This is the ONLY network path in the feature: it hands the finished note to
 * the existing Anthropic LLM helper and returns the raw model text. Parsing,
 * the allowlist and the mode gate all happen on our side, in @openclaw.
 *
 * NOT FOR CLINICAL DECISION-MAKING. NOT PRODUCTION AUTOMATION.
 */

import { runLLMRequest } from "@llm"
import { OPENCLAW_PLANNER_SYSTEM_PROMPT, buildPlannerPrompt } from "@openclaw"
import { getAnthropicApiKey } from "@storage/server-api-keys"

export async function planOpenClawActions(note: string): Promise<string> {
  const apiKey = getAnthropicApiKey()

  return runLLMRequest({
    system: OPENCLAW_PLANNER_SYSTEM_PROMPT,
    prompt: buildPlannerPrompt(note),
    apiKey,
  })
}
