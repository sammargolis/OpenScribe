import { CLAW_EXECUTORS, type ClawExecutor, type ExecutorContext } from "./executors"
import { ClawPlannerError, planActions } from "./planner"
import { applyPolicy } from "./policy"
import { createMemoryClawStore } from "./store"
import {
  DEFAULT_ALLOWLIST,
  DEFAULT_CONFIDENCE_THRESHOLD,
  OPENCLAW_DISCLAIMER,
  type BlockedClawAction,
  type ClawAuditWriter,
  type ClawPlanner,
  type ClawReport,
  type ClawStore,
  type ExecutedClawAction,
  type OpenClawMode,
} from "./types"

export interface RunOpenClawOptions {
  note: string
  mode: OpenClawMode
  encounterId: string
  planner: ClawPlanner
  store?: ClawStore
  audit?: ClawAuditWriter
  allowlist?: readonly string[]
  confidenceThreshold?: number
  now?: () => string
  newId?: () => string
  /** Injectable for tests only; production always uses CLAW_EXECUTORS. */
  executors?: Readonly<Record<string, ClawExecutor>>
}

function defaultNow(): string {
  return new Date().toISOString()
}

function defaultNewId(): string {
  const maybeCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (maybeCrypto?.randomUUID) return maybeCrypto.randomUUID()
  return `claw-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

/**
 * Audit metadata must never carry PHI. Action types are model-controlled
 * strings, so only allowlisted values are logged verbatim.
 */
function auditSafeType(type: string, allowlist: readonly string[]): string {
  return allowlist.includes(type) ? type : "unlisted"
}

function emptyReport(mode: OpenClawMode, encounterId: string, generatedAt: string): ClawReport {
  return {
    mode,
    encounterId,
    generatedAt,
    proposed: [],
    executed: [],
    blocked: [],
    invalid: [],
    disclaimer: OPENCLAW_DISCLAIMER,
  }
}

/**
 * Run the OpenClaw POC for one note.
 *
 * Contract: this function NEVER throws and NEVER touches the note itself. A
 * planner outage, a malformed response or an executor failure all resolve to a
 * report the UI can display, so the note workflow is unaffected.
 */
export async function runOpenClaw(options: RunOpenClawOptions): Promise<ClawReport> {
  const now = options.now ?? defaultNow
  const newId = options.newId ?? defaultNewId
  const generatedAt = now()
  const allowlist = options.allowlist ?? DEFAULT_ALLOWLIST
  const confidenceThreshold = options.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD
  const audit = options.audit
  const mode = options.mode

  const writeAudit: ClawAuditWriter = async (params) => {
    if (!audit) return
    try {
      await audit(params)
    } catch {
      // Audit failures must never affect the note workflow or the report.
    }
  }

  // Mode gate #1: OFF short-circuits before the planner is ever called.
  if (mode === "off") {
    return emptyReport(mode, options.encounterId, generatedAt)
  }

  let planned
  try {
    planned = await planActions(options.note, options.planner)
  } catch (error) {
    const message =
      error instanceof ClawPlannerError
        ? error.message
        : `Planner failed: ${error instanceof Error ? error.message : String(error)}`
    await writeAudit({
      event_type: "openclaw.planner_failed",
      success: false,
      resource_id: options.encounterId,
      error_message: message,
      metadata: { mode },
    })
    return { ...emptyReport(mode, options.encounterId, generatedAt), plannerError: message }
  }

  let decision
  try {
    // Mode gate #2 and the allowlist live here — the single chokepoint.
    decision = applyPolicy(planned.actions, { mode, allowlist, confidenceThreshold })
  } catch (error) {
    const message = `Policy engine refused the plan: ${error instanceof Error ? error.message : String(error)}`
    await writeAudit({
      event_type: "openclaw.planner_failed",
      success: false,
      resource_id: options.encounterId,
      error_message: message,
      metadata: { mode },
    })
    return { ...emptyReport(mode, options.encounterId, generatedAt), plannerError: message }
  }

  await writeAudit({
    event_type: "openclaw.actions_proposed",
    success: true,
    resource_id: options.encounterId,
    metadata: {
      mode,
      proposed_count: decision.proposed.length,
      approved_count: decision.executed.length,
      blocked_count: decision.blocked.length,
      invalid_count: planned.invalid.length,
      action_types: decision.proposed.map((action) => auditSafeType(action.type, allowlist)),
      confidences: decision.proposed.map((action) => Number(action.confidence.toFixed(2))),
      confidence_threshold: confidenceThreshold,
    },
  })

  const blocked: BlockedClawAction[] = [...decision.blocked]
  for (const entry of decision.blocked) {
    await writeAudit({
      event_type: "openclaw.action_blocked",
      success: true,
      resource_id: options.encounterId,
      metadata: {
        mode,
        action_type: auditSafeType(entry.action.type, allowlist),
        reason_code: entry.reasonCode,
        confidence: Number(entry.action.confidence.toFixed(2)),
      },
    })
  }

  const executed: ExecutedClawAction[] = []

  // Only `decision.executed` is ever executed. In SUGGEST_ONLY that array is
  // empty by construction, so no executor is reachable.
  if (decision.executed.length > 0) {
    const registry = options.executors ?? CLAW_EXECUTORS
    const context: ExecutorContext = {
      encounterId: options.encounterId,
      store: options.store ?? createMemoryClawStore(),
      now,
      newId,
    }

    for (const action of decision.executed) {
      try {
        const executor = registry[action.type]
        if (!executor) {
          throw new Error(`No executor registered for action type "${action.type}"`)
        }
        const record = executor(action, context)
        executed.push({ action, record })
        await writeAudit({
          event_type: "openclaw.action_executed",
          success: true,
          resource_id: options.encounterId,
          metadata: {
            mode,
            action_type: auditSafeType(action.type, allowlist),
            confidence: Number(action.confidence.toFixed(2)),
            record_kind: record.kind,
          },
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        blocked.push({
          action,
          reasonCode: "executor_failed",
          reason: `Execution failed: ${message}`,
        })
        await writeAudit({
          event_type: "openclaw.action_blocked",
          success: false,
          resource_id: options.encounterId,
          error_message: message,
          metadata: {
            mode,
            action_type: auditSafeType(action.type, allowlist),
            reason_code: "executor_failed",
          },
        })
      }
    }
  }

  return {
    mode,
    encounterId: options.encounterId,
    generatedAt,
    proposed: decision.proposed,
    executed,
    blocked,
    invalid: planned.invalid,
    disclaimer: OPENCLAW_DISCLAIMER,
  }
}
