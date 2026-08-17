import assert from "node:assert/strict"
import test from "node:test"
import { ClawPlannerError, extractJsonObject, parsePlannerResponse, planActions } from "../planner.js"

/**
 * Planner parsing tests.
 *
 * The planner response is untrusted LLM output: malformed responses must be
 * rejected rather than trusted, and a single bad action must not poison the
 * whole batch.
 */

const VALID = JSON.stringify({
  actions: [
    { type: "create_task", payload: { title: "Chase CBC result" }, confidence: 0.82, reason: "Labs pending" },
  ],
})

test("parses a well-formed planner response", () => {
  const result = parsePlannerResponse(VALID)
  assert.equal(result.actions.length, 1)
  assert.equal(result.invalid.length, 0)
  assert.equal(result.actions[0].type, "create_task")
  assert.equal(result.actions[0].confidence, 0.82)
})

test("strips markdown fences and surrounding prose", () => {
  const raw = "Here you go:\n```json\n" + VALID + "\n```\nHope that helps!"
  const result = parsePlannerResponse(raw)
  assert.equal(result.actions.length, 1)
})

test("extractJsonObject returns null when there is no object", () => {
  assert.equal(extractJsonObject("I cannot help with that."), null)
})

test("rejects a response that is not JSON", () => {
  assert.throws(() => parsePlannerResponse("I refuse { to comply"), ClawPlannerError)
})

test("rejects a response with no JSON object at all", () => {
  assert.throws(() => parsePlannerResponse("no actions today"), ClawPlannerError)
})

test("rejects a response missing the actions array", () => {
  assert.throws(() => parsePlannerResponse(JSON.stringify({ plan: "do stuff" })), ClawPlannerError)
})

test("rejects a response where actions is not an array", () => {
  assert.throws(() => parsePlannerResponse(JSON.stringify({ actions: "create_task" })), ClawPlannerError)
})

test("drops individually malformed actions and reports them as invalid", () => {
  const raw = JSON.stringify({
    actions: [
      { type: "create_task", payload: { title: "ok" }, confidence: 0.9, reason: "fine" },
      { type: "create_task", confidence: 5, reason: "confidence out of range" },
      { payload: {}, confidence: 0.5, reason: "missing type" },
      "not an object",
      { type: "tag_encounter", payload: { tag: "x" }, confidence: "high", reason: "wrong type" },
    ],
  })

  const result = parsePlannerResponse(raw)
  assert.equal(result.actions.length, 1)
  assert.equal(result.invalid.length, 4)
  assert.deepEqual(
    result.invalid.map((entry) => entry.index),
    [1, 2, 3, 4],
  )
  assert.equal(result.invalid[0].type, "create_task")
  assert.equal(result.invalid[1].type, "unknown")
  for (const entry of result.invalid) {
    assert.ok(entry.issue.length > 0, "invalid entries must carry an issue summary")
  }
})

test("keeps unknown action types so policy can block them visibly", () => {
  const raw = JSON.stringify({
    actions: [{ type: "send_fax", payload: { to: "555" }, confidence: 0.99, reason: "why not" }],
  })
  const result = parsePlannerResponse(raw)
  assert.equal(result.actions.length, 1)
  assert.equal(result.actions[0].type, "send_fax")
})

test("defaults a missing payload to an empty object", () => {
  const raw = JSON.stringify({
    actions: [{ type: "create_task", confidence: 0.7, reason: "no payload" }],
  })
  const result = parsePlannerResponse(raw)
  assert.deepEqual(result.actions[0].payload, {})
})

test("planActions normalizes planner transport failures", async () => {
  await assert.rejects(
    () =>
      planActions("note text", async () => {
        throw new Error("network down")
      }),
    (error: unknown) => {
      assert.ok(error instanceof ClawPlannerError)
      assert.match((error as Error).message, /network down/)
      return true
    },
  )
})

test("planActions skips the planner for an empty note", async () => {
  let calls = 0
  const result = await planActions("   ", async () => {
    calls += 1
    return VALID
  })
  assert.equal(calls, 0)
  assert.deepEqual(result, { actions: [], invalid: [] })
})

test("planActions passes the note through to the planner", async () => {
  const seen: string[] = []
  const result = await planActions("Assessment: viral URI", async (note) => {
    seen.push(note)
    return VALID
  })
  assert.deepEqual(seen, ["Assessment: viral URI"])
  assert.equal(result.actions.length, 1)
})
