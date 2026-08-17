import {
  createTaskPayloadSchema,
  followupReminderPayloadSchema,
  tagEncounterPayloadSchema,
} from "./schema"
import type { ClawAction, ClawRecord, ClawStore } from "./types"

export interface ExecutorContext {
  encounterId: string
  store: ClawStore
  /** Injected clock, ISO string. */
  now: () => string
  /** Injected id generator. */
  newId: () => string
}

export type ClawExecutor = (action: ClawAction, context: ExecutorContext) => ClawRecord

/** Thrown when an action reaches the executors without a registered handler. */
export class ClawExecutorError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ClawExecutorError"
  }
}

function writeRecord(
  context: ExecutorContext,
  kind: ClawRecord["kind"],
  data: Record<string, unknown>,
): ClawRecord {
  const record: ClawRecord = {
    id: context.newId(),
    kind,
    encounterId: context.encounterId,
    createdAt: context.now(),
    data,
  }
  context.store.append(record)
  return record
}

/** create_task — appends to the local task list. No network, no EHR. */
function executeCreateTask(action: ClawAction, context: ExecutorContext): ClawRecord {
  const payload = createTaskPayloadSchema.parse(action.payload)
  return writeRecord(context, "tasks", {
    title: payload.title,
    detail: payload.detail ?? "",
    done: false,
  })
}

/** set_followup_reminder — appends a local reminder. No calendar, no email. */
function executeSetFollowupReminder(action: ClawAction, context: ExecutorContext): ClawRecord {
  const payload = followupReminderPayloadSchema.parse(action.payload)
  const dueAt = new Date(new Date(context.now()).getTime() + payload.dueInDays * 86_400_000)
  return writeRecord(context, "reminders", {
    dueInDays: payload.dueInDays,
    dueAt: dueAt.toISOString(),
    detail: payload.detail ?? "",
  })
}

/** tag_encounter — appends a local metadata tag. */
function executeTagEncounter(action: ClawAction, context: ExecutorContext): ClawRecord {
  const payload = tagEncounterPayloadSchema.parse(action.payload)
  return writeRecord(context, "tags", { tag: payload.tag })
}

/**
 * The executor registry. Keys MUST stay in sync with DEFAULT_ALLOWLIST; an
 * action with no entry here can never run (see `executeAction`).
 */
export const CLAW_EXECUTORS: Readonly<Record<string, ClawExecutor>> = Object.freeze({
  create_task: executeCreateTask,
  set_followup_reminder: executeSetFollowupReminder,
  tag_encounter: executeTagEncounter,
})

/**
 * Execute a single already-approved action. Defense in depth: the executor
 * re-validates the payload, so a bypass of `applyPolicy` still cannot write
 * malformed data.
 */
export function executeAction(action: ClawAction, context: ExecutorContext): ClawRecord {
  const executor = CLAW_EXECUTORS[action.type]
  if (!executor) {
    throw new ClawExecutorError(`No executor registered for action type "${action.type}"`)
  }
  return executor(action, context)
}
