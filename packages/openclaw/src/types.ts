/**
 * OpenClaw — experimental "let OpenClaw cook" POC types.
 *
 * SAFETY MODEL (read this before changing anything in this package):
 * - Planner output is UNTRUSTED LLM output. It is parsed with zod (shape only),
 *   then permission is decided exclusively by `applyPolicy` on our side.
 * - The planner can never widen its own permissions: the allowlist, the
 *   confidence threshold and the mode gate are all enforced after parsing.
 * - `applyPolicy` is the single chokepoint. `runOpenClaw` may only execute
 *   actions that appear in `PolicyDecision.executed`, and that array is always
 *   empty unless mode === "tiny_actions_only".
 *
 * NOT FOR CLINICAL DECISION-MAKING. NOT PRODUCTION AUTOMATION.
 */

/** Mirrors `OpenClawMode` in packages/storage/src/preferences.ts. */
export type OpenClawMode = "off" | "suggest_only" | "tiny_actions_only"

/** The only action types that may ever execute. Everything else is blocked. */
export const ALLOWLISTED_ACTION_TYPES = [
  "create_task",
  "set_followup_reminder",
  "tag_encounter",
] as const

export type AllowlistedActionType = (typeof ALLOWLISTED_ACTION_TYPES)[number]

/** Default allowlist: tiny, local-only, reversible actions. */
export const DEFAULT_ALLOWLIST: readonly string[] = Object.freeze([...ALLOWLISTED_ACTION_TYPES])

/** Actions below this confidence are proposed but never executed. */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.6

/**
 * A single action proposed by the planner.
 * `type` is intentionally a plain string: unknown types must survive parsing so
 * that the policy engine can block them *with a visible reason* instead of the
 * parser silently dropping them.
 */
export interface ClawAction {
  type: string
  payload: Record<string, unknown>
  confidence: number
  reason: string
}

/** Planner output that failed shape validation and was discarded. */
export interface InvalidClawAction {
  /** Index in the raw planner action array. */
  index: number
  /** Reported action type, if it was at least a string. */
  type: string
  /** zod issue summary — never contains payload values. */
  issue: string
}

export type BlockReasonCode =
  | "mode_off"
  | "mode_suggest_only"
  | "not_allowlisted"
  | "low_confidence"
  | "invalid_payload"
  | "no_executor"
  | "executor_failed"

export interface BlockedClawAction {
  action: ClawAction
  reasonCode: BlockReasonCode
  /** Short human-readable explanation shown in the Claw Report. */
  reason: string
}

/**
 * Result of the policy engine.
 * - `proposed`: every well-formed action the planner returned.
 * - `executed`: actions APPROVED to execute. Empty unless mode is
 *   "tiny_actions_only". This is the only list `runOpenClaw` may execute.
 * - `blocked`: everything else, each with a machine-readable reason code.
 */
export interface PolicyDecision {
  proposed: readonly ClawAction[]
  executed: readonly ClawAction[]
  blocked: readonly BlockedClawAction[]
}

export interface PolicyOptions {
  mode: OpenClawMode
  allowlist?: readonly string[]
  confidenceThreshold?: number
}

export type ClawRecordKind = "tasks" | "reminders" | "tags"

/** A local-only record written by an executor. Never leaves the device. */
export interface ClawRecord {
  id: string
  kind: ClawRecordKind
  encounterId: string
  createdAt: string
  data: Record<string, unknown>
}

/** Local storage abstraction so executors stay unit-testable. */
export interface ClawStore {
  append: (record: ClawRecord) => void
  list: (kind?: ClawRecordKind) => ClawRecord[]
}

export interface ExecutedClawAction {
  action: ClawAction
  record: ClawRecord
}

export type ClawAuditEventType =
  | "openclaw.actions_proposed"
  | "openclaw.action_executed"
  | "openclaw.action_blocked"
  | "openclaw.planner_failed"

/**
 * Audit writer shape. Compatible with `writeAuditEntry` from
 * packages/storage/src/audit-log. Metadata must never carry note text or
 * payload contents (no-PHI-in-logs).
 */
export type ClawAuditWriter = (params: {
  event_type: ClawAuditEventType
  success: boolean
  resource_id?: string
  error_message?: string
  metadata?: Record<string, unknown>
}) => Promise<unknown>

/** The planner: takes note text, returns raw model text (expected to be JSON). */
export type ClawPlanner = (note: string) => Promise<string>

export interface ClawReport {
  mode: OpenClawMode
  encounterId: string
  generatedAt: string
  proposed: readonly ClawAction[]
  executed: readonly ExecutedClawAction[]
  blocked: readonly BlockedClawAction[]
  invalid: readonly InvalidClawAction[]
  /** Set when the planner call or response parsing failed. */
  plannerError?: string
  /** Always shown in the UI. */
  disclaimer: string
}

export const OPENCLAW_DISCLAIMER =
  "Experimental POC. Not for clinical decision-making and not production automation. Suggestions are unverified model output."
