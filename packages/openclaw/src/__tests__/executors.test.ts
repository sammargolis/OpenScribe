import assert from "node:assert/strict"
import test from "node:test"
import { CLAW_EXECUTORS, ClawExecutorError, executeAction, type ExecutorContext } from "../executors.js"
import { createMemoryClawStore } from "../store.js"
import { ALLOWLISTED_ACTION_TYPES, type ClawAction, type ClawStore } from "../types.js"

function makeContext(store: ClawStore): ExecutorContext {
  let counter = 0
  return {
    encounterId: "enc-1",
    store,
    now: () => "2026-01-01T00:00:00.000Z",
    newId: () => `id-${++counter}`,
  }
}

function action(type: string, payload: Record<string, unknown>): ClawAction {
  return { type, payload, confidence: 0.9, reason: "test" }
}

test("the executor registry covers exactly the allowlisted action types", () => {
  assert.deepEqual(Object.keys(CLAW_EXECUTORS).sort(), [...ALLOWLISTED_ACTION_TYPES].sort())
})

test("create_task writes a local task record", () => {
  const store = createMemoryClawStore()
  const record = executeAction(action("create_task", { title: "Chase CBC", detail: "call lab" }), makeContext(store))

  assert.equal(record.kind, "tasks")
  assert.equal(record.encounterId, "enc-1")
  assert.deepEqual(record.data, { title: "Chase CBC", detail: "call lab", done: false })
  assert.equal(store.list("tasks").length, 1)
})

test("set_followup_reminder writes a local reminder with a computed due date", () => {
  const store = createMemoryClawStore()
  const record = executeAction(action("set_followup_reminder", { dueInDays: 14 }), makeContext(store))

  assert.equal(record.kind, "reminders")
  assert.equal(record.data.dueInDays, 14)
  assert.equal(record.data.dueAt, "2026-01-15T00:00:00.000Z")
})

test("tag_encounter writes a local metadata tag", () => {
  const store = createMemoryClawStore()
  const record = executeAction(action("tag_encounter", { tag: "followup needed" }), makeContext(store))

  assert.equal(record.kind, "tags")
  assert.deepEqual(record.data, { tag: "followup needed" })
  assert.deepEqual(
    store.list().map((entry) => entry.kind),
    ["tags"],
  )
})

test("executeAction refuses an action type with no registered executor", () => {
  const store = createMemoryClawStore()
  assert.throws(() => executeAction(action("send_fax", { to: "555" }), makeContext(store)), ClawExecutorError)
  assert.equal(store.list().length, 0)
})

test("executors re-validate the payload as defense in depth", () => {
  const store = createMemoryClawStore()
  assert.throws(() => executeAction(action("create_task", { title: "" }), makeContext(store)))
  assert.throws(() => executeAction(action("tag_encounter", { tag: "../../etc/passwd" }), makeContext(store)))
  assert.equal(store.list().length, 0, "nothing may be written for an invalid payload")
})

test("memory store filters by kind", () => {
  const store = createMemoryClawStore()
  const context = makeContext(store)
  executeAction(action("create_task", { title: "a" }), context)
  executeAction(action("tag_encounter", { tag: "b" }), context)

  assert.equal(store.list().length, 2)
  assert.equal(store.list("tasks").length, 1)
  assert.equal(store.list("reminders").length, 0)
})
