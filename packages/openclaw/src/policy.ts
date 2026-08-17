import { ALLOWLISTED_PAYLOAD_SCHEMAS, summarizeZodIssues } from "./schema"
import {
  DEFAULT_ALLOWLIST,
  DEFAULT_CONFIDENCE_THRESHOLD,
  type BlockedClawAction,
  type ClawAction,
  type PolicyDecision,
  type PolicyOptions,
} from "./types"

function blocked(
  action: ClawAction,
  reasonCode: BlockedClawAction["reasonCode"],
  reason: string,
): BlockedClawAction {
  return { action, reasonCode, reason }
}

/**
 * THE SAFETY CHOKEPOINT.
 *
 * Pure function. Given untrusted planner actions plus our own configuration, it
 * decides what may execute. Callers may only execute `decision.executed`.
 *
 * Guarantees (each covered by a unit test in __tests__/policy.test.ts):
 * 1. mode "off"           -> executed is always empty.
 * 2. mode "suggest_only"  -> executed is always empty, whatever the planner says.
 * 3. mode "tiny_actions_only" -> executed contains only allowlisted action types
 *    that also clear the confidence threshold and have a valid payload.
 * 4. Every non-executed action appears in `blocked` with a machine-readable code.
 *
 * The planner cannot influence any of this: allowlist, threshold and mode all
 * come from our side of the boundary.
 */
export function applyPolicy(
  actions: readonly ClawAction[],
  options: PolicyOptions,
): PolicyDecision {
  const allowlist = options.allowlist ?? DEFAULT_ALLOWLIST
  const threshold =
    typeof options.confidenceThreshold === "number" && Number.isFinite(options.confidenceThreshold)
      ? options.confidenceThreshold
      : DEFAULT_CONFIDENCE_THRESHOLD
  const mode = options.mode

  const proposed: ClawAction[] = [...actions]
  const approved: ClawAction[] = []
  const rejected: BlockedClawAction[] = []

  for (const action of proposed) {
    if (!allowlist.includes(action.type)) {
      rejected.push(
        blocked(
          action,
          "not_allowlisted",
          `Action type "${action.type}" is not on the OpenClaw allowlist.`,
        ),
      )
      continue
    }

    const payloadSchema = ALLOWLISTED_PAYLOAD_SCHEMAS[action.type]
    if (!payloadSchema) {
      rejected.push(
        blocked(action, "no_executor", `No executor is registered for "${action.type}".`),
      )
      continue
    }

    const payloadCheck = payloadSchema.safeParse(action.payload)
    if (!payloadCheck.success) {
      rejected.push(
        blocked(
          action,
          "invalid_payload",
          `Payload does not match the "${action.type}" contract (${summarizeZodIssues(payloadCheck.error)}).`,
        ),
      )
      continue
    }

    if (action.confidence < threshold) {
      rejected.push(
        blocked(
          action,
          "low_confidence",
          `Confidence ${action.confidence.toFixed(2)} is below the ${threshold.toFixed(2)} threshold.`,
        ),
      )
      continue
    }

    if (mode === "off") {
      rejected.push(blocked(action, "mode_off", "OpenClaw mode is off, so nothing runs."))
      continue
    }

    if (mode === "suggest_only") {
      rejected.push(
        blocked(
          action,
          "mode_suggest_only",
          "Suggest Only mode never executes actions — this is a suggestion only.",
        ),
      )
      continue
    }

    approved.push(action)
  }

  // Belt and braces: the mode gate above already guarantees this, but an
  // explicit invariant means a future refactor fails loudly instead of quietly
  // widening permissions.
  if (mode !== "tiny_actions_only" && approved.length > 0) {
    throw new Error(
      `OpenClaw policy invariant violated: ${approved.length} action(s) approved in mode "${mode}"`,
    )
  }

  return Object.freeze({
    proposed: Object.freeze(proposed),
    executed: Object.freeze(approved),
    blocked: Object.freeze(rejected),
  })
}
