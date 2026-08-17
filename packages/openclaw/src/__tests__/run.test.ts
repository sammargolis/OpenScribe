import assert from "node:assert/strict"
import test from "node:test"
import { CLAW_EXECUTORS, type ClawExecutor } from "../executors.js"
import { runOpenClaw } from "../run.js"
import { createMemoryClawStore } from "../store.js"
import type { ClawAction, ClawAuditWriter, ClawStore, OpenClawMode } from "../types.js"

/**
 * Runner tests: mode gating, allowlist blocking, failure isolation and the
 * no-PHI-in-audit-metadata rule.
 */

interface AuditEntry {
  event_type: string
  success: boolean
  error_message?: string
  metadata?: Record<string, unknown>
}

function makeAudit(sink: AuditEntry[]): ClawAuditWriter {
  return async (params) => {
    sink.push(params as AuditEntry)
  }
}

function plannerReturning(actions: unknown[]) {
  return async () => JSON.stringify({ actions })
}

function goodActions(): ClawAction[] {
  return [
    { type: "create_task", payload: { title: "Chase CBC" }, confidence: 0.95, reason: "Labs pending" },
    { type: "set_followup_reminder", payload: { dueInDays: 14 }, confidence: 0.9, reason: "Recheck BP" },
    { type: "tag_encounter", payload: { tag: "hypertension" }, confidence: 0.88, reason: "HTN discussed" },
  ]
}

/** Executor registry that fails loudly if it is ever reached. */
function tripwireRegistry(calls: string[]): Readonly<Record<string, ClawExecutor>> {
  const tripwire: ClawExecutor = (action) => {
    calls.push(action.type)
    throw new Error(`EXECUTOR REACHED for ${action.type}`)
  }
  return Object.freeze({
    create_task: tripwire,
    set_followup_reminder: tripwire,
    tag_encounter: tripwire,
  })
}

test("off mode never calls the planner and returns an empty report", async () => {
  let plannerCalls = 0
  const audit: AuditEntry[] = []
  const store = createMemoryClawStore()

  const report = await runOpenClaw({
    note: "Assessment: hypertension, recheck in 2 weeks.",
    mode: "off",
    encounterId: "enc-1",
    store,
    audit: makeAudit(audit),
    planner: async () => {
      plannerCalls += 1
      return JSON.stringify({ actions: goodActions() })
    },
  })

  assert.equal(plannerCalls, 0, "off mode must not call the planner")
  assert.deepEqual(report.proposed, [])
  assert.deepEqual(report.executed, [])
  assert.deepEqual(report.blocked, [])
  assert.equal(audit.length, 0, "off mode must not write audit entries")
  assert.equal(store.list().length, 0)
})

/**
 * THE GUARANTEE: in SUGGEST_ONLY it is structurally impossible to reach an
 * executor. The registry below throws if it is ever invoked, and the run still
 * completes with an empty `executed` list and nothing written to the store.
 */
test("SUGGEST_ONLY cannot reach an executor", async () => {
  const executorCalls: string[] = []
  const store = createMemoryClawStore()
  const audit: AuditEntry[] = []

  const report = await runOpenClaw({
    note: "Assessment: hypertension, recheck in 2 weeks.",
    mode: "suggest_only",
    encounterId: "enc-1",
    store,
    audit: makeAudit(audit),
    executors: tripwireRegistry(executorCalls),
    planner: plannerReturning(goodActions()),
  })

  assert.deepEqual(executorCalls, [], "no executor may be invoked in suggest_only")
  assert.equal(report.executed.length, 0)
  assert.equal(store.list().length, 0, "nothing may be written to local storage")
  assert.equal(report.proposed.length, 3, "actions are still shown as suggestions")
  assert.equal(report.blocked.length, 3)
  for (const entry of report.blocked) {
    assert.equal(entry.reasonCode, "mode_suggest_only")
  }
  assert.equal(audit.filter((entry) => entry.event_type === "openclaw.action_executed").length, 0)
})

test("SUGGEST_ONLY writes nothing even with the real executor registry", async () => {
  const store = createMemoryClawStore()
  const report = await runOpenClaw({
    note: "Assessment: hypertension.",
    mode: "suggest_only",
    encounterId: "enc-1",
    store,
    planner: plannerReturning(goodActions()),
  })

  assert.equal(report.executed.length, 0)
  assert.equal(store.list().length, 0)
  assert.ok(Object.keys(CLAW_EXECUTORS).length > 0, "the real registry is non-empty, so this is a real check")
})

test("TINY_ACTIONS_ONLY executes only allowlisted actions and blocks the rest", async () => {
  const store = createMemoryClawStore()
  const audit: AuditEntry[] = []

  const report = await runOpenClaw({
    note: "Assessment: hypertension.",
    mode: "tiny_actions_only",
    encounterId: "enc-7",
    store,
    audit: makeAudit(audit),
    now: () => "2026-01-01T00:00:00.000Z",
    newId: () => "fixed-id",
    planner: plannerReturning([
      ...goodActions(),
      { type: "send_fax", payload: { to: "555-0100" }, confidence: 0.99, reason: "fax the note" },
      { type: "order_medication", payload: { drug: "warfarin" }, confidence: 1, reason: "anticoagulate" },
      { type: "create_task", payload: { title: "Low confidence task" }, confidence: 0.2, reason: "unsure" },
    ]),
  })

  assert.deepEqual(
    report.executed.map((entry) => entry.action.type),
    ["create_task", "set_followup_reminder", "tag_encounter"],
  )
  assert.deepEqual(
    report.blocked.map((entry) => [entry.action.type, entry.reasonCode]),
    [
      ["send_fax", "not_allowlisted"],
      ["order_medication", "not_allowlisted"],
      ["create_task", "low_confidence"],
    ],
  )
  assert.equal(store.list().length, 3, "only the three allowlisted actions wrote records")
  assert.equal(store.list("tasks").length, 1)
  assert.equal(store.list("reminders").length, 1)
  assert.equal(store.list("tags").length, 1)

  const executedEvents = audit.filter((entry) => entry.event_type === "openclaw.action_executed")
  const blockedEvents = audit.filter((entry) => entry.event_type === "openclaw.action_blocked")
  assert.equal(executedEvents.length, 3)
  assert.equal(blockedEvents.length, 3)
  assert.deepEqual(
    blockedEvents.map((entry) => entry.metadata?.reason_code),
    ["not_allowlisted", "not_allowlisted", "low_confidence"],
  )
})

test("blocked actions are visible with a human-readable reason", async () => {
  const report = await runOpenClaw({
    note: "Assessment: hypertension.",
    mode: "tiny_actions_only",
    encounterId: "enc-1",
    store: createMemoryClawStore(),
    planner: plannerReturning([
      { type: "delete_all_encounters", payload: {}, confidence: 1, reason: "spring cleaning" },
    ]),
  })

  assert.equal(report.blocked.length, 1)
  assert.equal(report.blocked[0].reasonCode, "not_allowlisted")
  assert.match(report.blocked[0].reason, /not on the OpenClaw allowlist/)
})

test("planner failure is isolated: the run resolves with a reported error", async () => {
  const audit: AuditEntry[] = []
  const store = createMemoryClawStore()

  const report = await runOpenClaw({
    note: "Assessment: hypertension.",
    mode: "tiny_actions_only",
    encounterId: "enc-1",
    store,
    audit: makeAudit(audit),
    planner: async () => {
      throw new Error("Anthropic request timed out after 45000ms")
    },
  })

  assert.ok(report.plannerError, "the failure is surfaced on the report, not thrown")
  assert.match(report.plannerError!, /timed out/)
  assert.deepEqual(report.executed, [])
  assert.deepEqual(report.proposed, [])
  assert.equal(store.list().length, 0)
  assert.deepEqual(
    audit.map((entry) => entry.event_type),
    ["openclaw.planner_failed"],
  )
  assert.equal(audit[0].success, false)
})

test("a malformed planner response is rejected, not trusted", async () => {
  const store = createMemoryClawStore()
  const report = await runOpenClaw({
    note: "Assessment: hypertension.",
    mode: "tiny_actions_only",
    encounterId: "enc-1",
    store,
    planner: async () => "Sure! I will fax the note and order labs.",
  })

  assert.ok(report.plannerError)
  assert.equal(report.executed.length, 0)
  assert.equal(store.list().length, 0)
})

test("individually malformed actions are surfaced as invalid without blocking the rest", async () => {
  const report = await runOpenClaw({
    note: "Assessment: hypertension.",
    mode: "tiny_actions_only",
    encounterId: "enc-1",
    store: createMemoryClawStore(),
    planner: plannerReturning([
      { type: "create_task", payload: { title: "Chase CBC" }, confidence: 0.9, reason: "Labs pending" },
      { type: "create_task", payload: { title: "Broken" }, confidence: 42, reason: "out of range" },
    ]),
  })

  assert.equal(report.executed.length, 1)
  assert.equal(report.invalid.length, 1)
  assert.equal(report.invalid[0].index, 1)
})

test("an executor failure is contained and reported as blocked", async () => {
  const audit: AuditEntry[] = []
  const report = await runOpenClaw({
    note: "Assessment: hypertension.",
    mode: "tiny_actions_only",
    encounterId: "enc-1",
    store: createMemoryClawStore(),
    audit: makeAudit(audit),
    executors: Object.freeze({
      create_task: () => {
        throw new Error("local storage unavailable")
      },
    }),
    planner: plannerReturning([
      { type: "create_task", payload: { title: "Chase CBC" }, confidence: 0.9, reason: "Labs pending" },
    ]),
  })

  assert.equal(report.executed.length, 0)
  assert.equal(report.blocked.length, 1)
  assert.equal(report.blocked[0].reasonCode, "executor_failed")
  assert.match(report.blocked[0].reason, /local storage unavailable/)
})

test("an audit writer failure never breaks the run", async () => {
  const report = await runOpenClaw({
    note: "Assessment: hypertension.",
    mode: "tiny_actions_only",
    encounterId: "enc-1",
    store: createMemoryClawStore(),
    audit: async () => {
      throw new Error("audit storage full")
    },
    planner: plannerReturning(goodActions()),
  })

  assert.equal(report.executed.length, 3)
})

test("audit metadata carries no note text and no payload contents", async () => {
  const audit: AuditEntry[] = []
  const phi = "Jane Doe 1975-02-03 MRN 44821"

  await runOpenClaw({
    note: `Patient ${phi} presents with chest pain. Assessment: GERD.`,
    mode: "tiny_actions_only",
    encounterId: "enc-1",
    store: createMemoryClawStore(),
    audit: makeAudit(audit),
    planner: plannerReturning([
      { type: "create_task", payload: { title: `Call ${phi}` }, confidence: 0.9, reason: `Follow up with ${phi}` },
      { type: `exfiltrate ${phi}`, payload: { title: phi }, confidence: 1, reason: phi },
    ]),
  })

  const serialized = JSON.stringify(audit)
  assert.ok(audit.length > 0, "audit entries were written")
  assert.equal(serialized.includes("Jane Doe"), false, "audit metadata must not contain patient names")
  assert.equal(serialized.includes("44821"), false, "audit metadata must not contain identifiers")
  assert.equal(serialized.includes("chest pain"), false, "audit metadata must not contain note text")
  assert.equal(serialized.includes("GERD"), false)
  // The model-controlled action type is only logged verbatim when allowlisted.
  const proposedEvent = audit.find((entry) => entry.event_type === "openclaw.actions_proposed")
  assert.deepEqual(proposedEvent?.metadata?.action_types, ["create_task", "unlisted"])
})

test("the report always carries the experimental disclaimer", async () => {
  const modes: OpenClawMode[] = ["off", "suggest_only", "tiny_actions_only"]
  for (const mode of modes) {
    const store: ClawStore = createMemoryClawStore()
    const report = await runOpenClaw({
      note: "Assessment: hypertension.",
      mode,
      encounterId: "enc-1",
      store,
      planner: plannerReturning(goodActions()),
    })
    assert.match(report.disclaimer, /Experimental POC/)
    assert.equal(report.mode, mode)
  }
})
