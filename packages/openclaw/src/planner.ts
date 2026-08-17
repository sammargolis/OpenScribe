import { clawActionSchema, plannerResponseSchema, summarizeZodIssues } from "./schema"
import type { ClawAction, ClawPlanner, InvalidClawAction } from "./types"

export interface PlanResult {
  /** Well-formed actions. Still UNTRUSTED — permission is decided by applyPolicy. */
  actions: ClawAction[]
  /** Actions the planner returned that failed shape validation and were dropped. */
  invalid: InvalidClawAction[]
}

/** Thrown when the planner errors or returns something we refuse to trust. */
export class ClawPlannerError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ClawPlannerError"
  }
}

/**
 * Pull the JSON object out of a model response. Handles ```json fences and
 * leading/trailing prose. Returns null when there is nothing object-shaped.
 */
export function extractJsonObject(raw: string): string | null {
  const withoutFences = raw.replace(/```(?:json)?/gi, "").trim()
  const start = withoutFences.indexOf("{")
  const end = withoutFences.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) return null
  return withoutFences.slice(start, end + 1)
}

/**
 * Parse an untrusted planner response into well-formed actions.
 *
 * Validation is SHAPE ONLY. Anything that parses is still fully untrusted and
 * must go through `applyPolicy` before it can be executed.
 */
export function parsePlannerResponse(raw: string): PlanResult {
  const json = extractJsonObject(raw ?? "")
  if (!json) {
    throw new ClawPlannerError("Planner response contained no JSON object")
  }

  let decoded: unknown
  try {
    decoded = JSON.parse(json)
  } catch {
    throw new ClawPlannerError("Planner response was not valid JSON")
  }

  const envelope = plannerResponseSchema.safeParse(decoded)
  if (!envelope.success) {
    throw new ClawPlannerError(
      `Planner response failed schema validation (${summarizeZodIssues(envelope.error)})`,
    )
  }

  const actions: ClawAction[] = []
  const invalid: InvalidClawAction[] = []

  envelope.data.actions.forEach((candidate, index) => {
    const parsed = clawActionSchema.safeParse(candidate)
    if (parsed.success) {
      actions.push({
        type: parsed.data.type,
        payload: parsed.data.payload,
        confidence: parsed.data.confidence,
        reason: parsed.data.reason,
      })
      return
    }

    const reportedType =
      candidate && typeof candidate === "object" && typeof (candidate as { type?: unknown }).type === "string"
        ? ((candidate as { type: string }).type.slice(0, 64) as string)
        : "unknown"

    invalid.push({
      index,
      type: reportedType,
      issue: summarizeZodIssues(parsed.error),
    })
  })

  return { actions, invalid }
}

/**
 * Call the planner with the note and parse the response.
 * Any planner transport failure is normalized to `ClawPlannerError`.
 */
export async function planActions(note: string, planner: ClawPlanner): Promise<PlanResult> {
  if (typeof note !== "string" || note.trim().length === 0) {
    return { actions: [], invalid: [] }
  }

  let raw: string
  try {
    raw = await planner(note)
  } catch (error) {
    throw new ClawPlannerError(
      `Planner call failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  return parsePlannerResponse(raw)
}
