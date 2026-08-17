import assert from "node:assert/strict"
import test from "node:test"
import { resolveCapabilityStatus, type CapabilityStatusInput } from "../capability-status.js"

const ONLINE_MIXED_READY: CapabilityStatusInput = {
  online: true,
  processingMode: "mixed",
  hasApiKey: true,
  whisperReady: true,
}

function stepById(input: CapabilityStatusInput, id: "transcription" | "note-generation") {
  const status = resolveCapabilityStatus(input)
  const step = status.steps.find((candidate) => candidate.id === id)
  assert.ok(step, `expected a ${id} step`)
  return step
}

test("mixed mode online with an API key can record and reports both steps ready", () => {
  const status = resolveCapabilityStatus(ONLINE_MIXED_READY)
  assert.equal(status.canStartRecording, true)
  assert.equal(status.severity, "ready")
  assert.equal(status.fix, null)
  assert.equal(status.blockedReason, "")
  assert.deepEqual(
    status.steps.map((step) => step.status),
    ["available", "available"],
  )
})

test("mixed mode offline blocks recording and suggests switching to local-only", () => {
  const status = resolveCapabilityStatus({ ...ONLINE_MIXED_READY, online: false })
  assert.equal(status.canStartRecording, false)
  assert.equal(status.severity, "blocked")
  assert.equal(status.fix, "switch-to-local")
  assert.match(status.headline, /note generation will fail/i)
  assert.match(status.blockedReason, /offline/i)
  assert.equal(stepById({ ...ONLINE_MIXED_READY, online: false }, "note-generation").status, "unavailable")
})

test("transcription stays available offline because Whisper runs locally", () => {
  const step = stepById({ ...ONLINE_MIXED_READY, online: false }, "transcription")
  assert.equal(step.status, "available")
  assert.equal(step.statusLabel, "Ready")
})

test("local mode offline is not alarming and still allows recording", () => {
  const status = resolveCapabilityStatus({
    online: false,
    processingMode: "local",
    hasApiKey: false,
    whisperReady: true,
  })
  assert.equal(status.canStartRecording, true)
  assert.equal(status.severity, "ready")
  assert.equal(status.fix, null)
  assert.match(status.headline, /local-only mode is ready/i)
  assert.match(status.message, /nothing is blocked/i)
})

test("local mode does not require an Anthropic API key", () => {
  const step = stepById(
    { online: false, processingMode: "local", hasApiKey: false, whisperReady: true },
    "note-generation",
  )
  assert.equal(step.status, "available")
  assert.match(step.detail, /No network needed/i)
})

test("mixed mode online without an API key blocks recording and asks for the key", () => {
  const status = resolveCapabilityStatus({ ...ONLINE_MIXED_READY, hasApiKey: false })
  assert.equal(status.canStartRecording, false)
  assert.equal(status.fix, "add-api-key")
  assert.equal(stepById({ ...ONLINE_MIXED_READY, hasApiKey: false }, "note-generation").statusLabel, "Needs API key")
})

test("an unready Whisper runtime blocks recording in every mode", () => {
  for (const processingMode of ["mixed", "local"] as const) {
    const status = resolveCapabilityStatus({
      online: true,
      processingMode,
      hasApiKey: true,
      whisperReady: false,
    })
    assert.equal(status.canStartRecording, false, `${processingMode} should be blocked`)
    assert.equal(status.fix, "wait-for-runtime")
    assert.match(status.headline, /Transcription is not ready/i)
  }
})

test("transcription readiness takes precedence over the offline note-generation warning", () => {
  const status = resolveCapabilityStatus({
    online: false,
    processingMode: "mixed",
    hasApiKey: true,
    whisperReady: false,
  })
  assert.equal(status.fix, "wait-for-runtime")
  assert.equal(status.steps.filter((step) => step.status === "unavailable").length, 2)
})

test("every step carries a non-empty label, statusLabel, and detail", () => {
  const status = resolveCapabilityStatus(ONLINE_MIXED_READY)
  for (const step of status.steps) {
    assert.ok(step.label.length > 0)
    assert.ok(step.statusLabel.length > 0)
    assert.ok(step.detail.length > 0)
  }
})
