import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"

const utils = await import(path.resolve("packages/shell/whisper-runtime-utils.js"))
const {
  computeWhisperHealthWaitProfile,
  classifyWhisperHealthTimeout,
  classifyWhisperDownloadFailure,
  sanitizeErrorMessage,
} = utils.default

test("computeWhisperHealthWaitProfile uses longer timeout for cold starts", () => {
  const warm = computeWhisperHealthWaitProfile({ coldStart: false })
  const cold = computeWhisperHealthWaitProfile({ coldStart: true })
  assert.ok(cold.timeoutMs > warm.timeoutMs)
  assert.ok(cold.intervalMs >= warm.intervalMs)
})

test("classifyWhisperHealthTimeout marks active process as STARTING", () => {
  const result = classifyWhisperHealthTimeout({
    processRunning: true,
    lastExitCode: null,
    host: "127.0.0.1",
    port: 8002,
  })
  assert.equal(result.reason, "STARTING")
  assert.equal(result.code, "WHISPER_STARTING")
  assert.equal(result.retryable, true)
})

test("classifyWhisperHealthTimeout marks exited process as UNHEALTHY", () => {
  const result = classifyWhisperHealthTimeout({
    processRunning: false,
    lastExitCode: 1,
    host: "127.0.0.1",
    port: 8002,
  })
  assert.equal(result.reason, "UNHEALTHY")
  assert.equal(result.code, "WHISPER_UNHEALTHY")
})

test("classifyWhisperDownloadFailure returns MODEL_DOWNLOAD_FAILED", () => {
  const result = classifyWhisperDownloadFailure("SSL: CERTIFICATE_VERIFY_FAILED", 1)
  assert.equal(result.reason, "MODEL_DOWNLOAD_FAILED")
  assert.equal(result.code, "WHISPER_DOWNLOAD_FAILED")
  assert.equal(result.exitCode, 1)
  assert.match(result.error, /CERTIFICATE_VERIFY_FAILED/)
})

test("sanitizeErrorMessage strips ANSI and truncates", () => {
  const raw = "\u001b[31mboom\u001b[0m \n with  spaces"
  assert.equal(sanitizeErrorMessage(raw, 20), "boom with spaces")
})
