import assert from "node:assert/strict"
import test from "node:test"
import { applyPolicy } from "../policy.js"
import { ALLOWLISTED_ACTION_TYPES, DEFAULT_ALLOWLIST, type ClawAction, type OpenClawMode } from "../types.js"

/**
 * Policy engine tests.
 *
 * `applyPolicy` is the single safety chokepoint for the OpenClaw POC, so the
 * guarantees in the issue are asserted here rather than inferred from the UI.
 */

function action(overrides: Partial<ClawAction> = {}): ClawAction {
  return {
    type: "create_task",
    payload: { title: "Order follow-up labs" },
    confidence: 0.9,
    reason: "Note mentions pending labs",
    ...overrides,
  }
}

const ALL_MODES: OpenClawMode[] = ["off", "suggest_only", "tiny_actions_only"]

test("off mode blocks every action with mode_off", () => {
  const decision = applyPolicy([action(), action({ type: "tag_encounter", payload: { tag: "diabetes" } })], {
    mode: "off",
  })

  assert.equal(decision.executed.length, 0)
  assert.equal(decision.proposed.length, 2)
  assert.deepEqual(
    decision.blocked.map((entry) => entry.reasonCode),
    ["mode_off", "mode_off"],
  )
})

test("SUGGEST_ONLY never approves an action for execution", () => {
  const decision = applyPolicy(
    [
      action(),
      action({ type: "set_followup_reminder", payload: { dueInDays: 14 } }),
      action({ type: "tag_encounter", payload: { tag: "htn" }, confidence: 1 }),
    ],
    { mode: "suggest_only" },
  )

  assert.equal(decision.executed.length, 0, "suggest_only must approve nothing")
  assert.equal(decision.proposed.length, 3, "all actions are still proposed for display")
  for (const entry of decision.blocked) {
    assert.equal(entry.reasonCode, "mode_suggest_only")
    assert.match(entry.reason, /never executes/i)
  }
})

test("SUGGEST_ONLY approves nothing across every allowlisted type and confidence", () => {
  for (const type of ALLOWLISTED_ACTION_TYPES) {
    for (const confidence of [0, 0.25, 0.5, 0.6, 0.75, 0.99, 1]) {
      const payload =
        type === "create_task"
          ? { title: "Task" }
          : type === "set_followup_reminder"
            ? { dueInDays: 7 }
            : { tag: "followup" }
      const decision = applyPolicy([action({ type, payload, confidence })], { mode: "suggest_only" })
      assert.equal(
        decision.executed.length,
        0,
        `suggest_only approved ${type} at confidence ${confidence}`,
      )
      assert.equal(decision.blocked.length, 1)
    }
  }
})

test("TINY_ACTIONS_ONLY approves only allowlisted types", () => {
  const decision = applyPolicy(
    [
      action(),
      action({ type: "send_fax", payload: { to: "555" } }),
      action({ type: "order_medication", payload: { drug: "warfarin" } }),
      action({ type: "delete_encounter", payload: {} }),
      action({ type: "tag_encounter", payload: { tag: "followup" } }),
    ],
    { mode: "tiny_actions_only" },
  )

  assert.deepEqual(
    decision.executed.map((entry) => entry.type),
    ["create_task", "tag_encounter"],
  )
  assert.deepEqual(
    decision.blocked.map((entry) => [entry.action.type, entry.reasonCode]),
    [
      ["send_fax", "not_allowlisted"],
      ["order_medication", "not_allowlisted"],
      ["delete_encounter", "not_allowlisted"],
    ],
  )
  for (const entry of decision.blocked) {
    assert.match(entry.reason, /not on the OpenClaw allowlist/)
  }
})

test("planner cannot widen its own permissions via the action type", () => {
  const hostile = [
    action({ type: "CREATE_TASK" }),
    action({ type: " create_task " }),
    action({ type: "create_task; send_fax" }),
    action({ type: "create_task\n" }),
  ]

  // Note: schema trimming happens in the parser, so " create_task " never
  // reaches policy untrimmed in production. Policy still matches exactly.
  const decision = applyPolicy(hostile, { mode: "tiny_actions_only" })
  assert.equal(decision.executed.length, 0, "near-miss action types must not execute")
  const allowedByPolicy = decision.executed.filter((entry) => !DEFAULT_ALLOWLIST.includes(entry.type))
  assert.equal(allowedByPolicy.length, 0)
  assert.deepEqual(
    decision.blocked.map((entry) => entry.reasonCode),
    ["not_allowlisted", "not_allowlisted", "not_allowlisted", "not_allowlisted"],
  )
})

test("actions below the confidence threshold are blocked with low_confidence", () => {
  const decision = applyPolicy([action({ confidence: 0.4 }), action({ confidence: 0.6 })], {
    mode: "tiny_actions_only",
    confidenceThreshold: 0.6,
  })

  assert.equal(decision.executed.length, 1)
  assert.equal(decision.blocked.length, 1)
  assert.equal(decision.blocked[0].reasonCode, "low_confidence")
  assert.match(decision.blocked[0].reason, /below the 0.60 threshold/)
})

test("allowlisted actions with a bad payload are blocked, not executed", () => {
  const decision = applyPolicy(
    [
      action({ payload: {} }),
      action({ type: "set_followup_reminder", payload: { dueInDays: 9000 } }),
      action({ type: "tag_encounter", payload: { tag: "<script>alert(1)</script>" } }),
    ],
    { mode: "tiny_actions_only" },
  )

  assert.equal(decision.executed.length, 0)
  assert.deepEqual(
    decision.blocked.map((entry) => entry.reasonCode),
    ["invalid_payload", "invalid_payload", "invalid_payload"],
  )
})

test("a narrowed allowlist further restricts execution", () => {
  const decision = applyPolicy([action(), action({ type: "tag_encounter", payload: { tag: "x" } })], {
    mode: "tiny_actions_only",
    allowlist: ["tag_encounter"],
  })

  assert.deepEqual(
    decision.executed.map((entry) => entry.type),
    ["tag_encounter"],
  )
  assert.equal(decision.blocked[0].reasonCode, "not_allowlisted")
})

test("every proposed action is accounted for in exactly one bucket", () => {
  const actions = [
    action(),
    action({ confidence: 0.1 }),
    action({ type: "send_fax" }),
    action({ payload: { title: "" } }),
  ]

  for (const mode of ALL_MODES) {
    const decision = applyPolicy(actions, { mode })
    assert.equal(
      decision.executed.length + decision.blocked.length,
      decision.proposed.length,
      `bucket accounting failed for mode ${mode}`,
    )
  }
})

test("policy result arrays are frozen so callers cannot smuggle actions in", () => {
  const decision = applyPolicy([action()], { mode: "suggest_only" })
  assert.ok(Object.isFrozen(decision.executed))
  assert.throws(() => (decision.executed as ClawAction[]).push(action()))
})

test("empty input yields empty buckets in every mode", () => {
  for (const mode of ALL_MODES) {
    const decision = applyPolicy([], { mode })
    assert.deepEqual(decision.proposed, [])
    assert.deepEqual(decision.executed, [])
    assert.deepEqual(decision.blocked, [])
  }
})
