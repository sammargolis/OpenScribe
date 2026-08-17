/**
 * OpenClaw — experimental "let OpenClaw cook" POC (note -> suggested actions).
 *
 * NOT FOR CLINICAL DECISION-MAKING. NOT PRODUCTION AUTOMATION.
 * See docs/OPENCLAW_MODE.md for the safety model.
 *
 * This package is intentionally self-contained (zod is its only import) so it
 * can be deleted in one move if the experiment does not pan out.
 */

export * from "./types"
export { applyPolicy } from "./policy"
export { planActions, parsePlannerResponse, extractJsonObject, ClawPlannerError } from "./planner"
export type { PlanResult } from "./planner"
export { CLAW_EXECUTORS, executeAction, ClawExecutorError } from "./executors"
export type { ClawExecutor, ExecutorContext } from "./executors"
export { createBrowserClawStore, createMemoryClawStore, CLAW_RECORDS_KEY } from "./store"
export { OPENCLAW_PLANNER_SYSTEM_PROMPT, buildPlannerPrompt } from "./prompt"
export { runOpenClaw } from "./run"
export type { RunOpenClawOptions } from "./run"
export {
  clawActionSchema,
  plannerResponseSchema,
  createTaskPayloadSchema,
  followupReminderPayloadSchema,
  tagEncounterPayloadSchema,
} from "./schema"
