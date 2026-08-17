import test from "node:test"
import assert from "node:assert/strict"
import path from "node:path"

const utils = await import(path.resolve("packages/shell/whisper-runtime-utils.js"))
const {
  computeWhisperHealthWaitProfile,
  classifyBackendSpawnFailure,
  classifyWhisperHealthTimeout,
  classifyWhisperDownloadFailure,
  describeBackendBinaryPreflight,
  resolveWhisperModelCacheDir,
  pickWhisperModelDirCandidates,
  buildWhisperChildEnv,
  extractBackendFailureMessage,
  isWhisperModelFileName,
  sanitizeErrorMessage,
  WHISPER_MODELS_DIR_ENV,
} = utils.default

test("computeWhisperHealthWaitProfile uses longer timeout for cold starts", () => {
  const warm = computeWhisperHealthWaitProfile({ coldStart: false })
  const cold = computeWhisperHealthWaitProfile({ coldStart: true })
  assert.ok(cold.timeoutMs > warm.timeoutMs)
  assert.ok(cold.intervalMs >= warm.intervalMs)
})

test("computeWhisperHealthWaitProfile applies the cold budget to a reused process too", () => {
  // Regression for #56: the reused-process branch used a hardcoded 6s wait, so a
  // first-ever start reported UNHEALTHY while the model was still downloading.
  const reusedWarm = computeWhisperHealthWaitProfile({ reusedProcess: true })
  const reusedCold = computeWhisperHealthWaitProfile({ coldStart: true, reusedProcess: true })
  assert.ok(reusedWarm.timeoutMs > 6000)
  assert.ok(reusedCold.timeoutMs > reusedWarm.timeoutMs)
  assert.equal(reusedCold.coldStart, true)
})

test("computeWhisperHealthWaitProfile honours an interactive cap", () => {
  const capped = computeWhisperHealthWaitProfile({ coldStart: true, maxWaitMs: 20000 })
  assert.equal(capped.timeoutMs, 20000)
  assert.equal(capped.capped, true)
  assert.ok(capped.intervalMs >= 100)

  const uncapped = computeWhisperHealthWaitProfile({ coldStart: false, maxWaitMs: 60000 })
  assert.equal(uncapped.timeoutMs, 6000)
  assert.equal(uncapped.capped, false)
})

test("classifyBackendSpawnFailure maps spawn errno to a cause", () => {
  assert.equal(classifyBackendSpawnFailure({ code: "ENOENT", message: "spawn x ENOENT" }), "BACKEND_MISSING")
  assert.equal(classifyBackendSpawnFailure({ code: "EACCES", message: "spawn x EACCES" }), "BACKEND_NOT_EXECUTABLE")
  assert.equal(classifyBackendSpawnFailure({ code: "EPERM", message: "operation not permitted" }), "BACKEND_NOT_EXECUTABLE")
  assert.equal(classifyBackendSpawnFailure({ message: "bad CPU type in executable" }), "BACKEND_ARCH_MISMATCH")
  assert.equal(classifyBackendSpawnFailure({ message: "everything is fine" }), "")
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

test("classifyWhisperHealthTimeout explains a first-run model download", () => {
  const result = classifyWhisperHealthTimeout({
    processRunning: true,
    lastExitCode: null,
    modelPresent: false,
  })
  assert.equal(result.reason, "STARTING")
  assert.equal(result.cause, "MODEL_DOWNLOAD_IN_PROGRESS")
  assert.match(result.userMessage, /downloading/i)
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
  assert.match(result.error, /exited with code 1/)
})

test("classifyWhisperHealthTimeout reports a missing sidecar instead of UNHEALTHY", () => {
  const result = classifyWhisperHealthTimeout({
    processRunning: false,
    spawnError: { code: "ENOENT", message: "spawn /Applications/OpenScribe.app/... ENOENT" },
    backendPath: "/Applications/OpenScribe.app/Contents/Resources/openscribe-backend/openscribe-backend",
  })
  assert.equal(result.code, "WHISPER_BACKEND_MISSING")
  assert.equal(result.reason, "BACKEND_MISSING")
  assert.equal(result.retryable, false)
})

test("classifyWhisperHealthTimeout reports a blocked sidecar with quarantine remediation", () => {
  const result = classifyWhisperHealthTimeout({
    processRunning: false,
    spawnError: { code: "EACCES", message: "spawn EACCES" },
    backendPath: "/Applications/OpenScribe.app/Contents/Resources/openscribe-backend/openscribe-backend",
    platform: "darwin",
  })
  assert.equal(result.code, "WHISPER_BACKEND_NOT_EXECUTABLE")
  assert.match(result.userMessage, /com\.apple\.quarantine/)
})

test("classifyWhisperDownloadFailure returns MODEL_DOWNLOAD_FAILED", () => {
  const result = classifyWhisperDownloadFailure("SSL: CERTIFICATE_VERIFY_FAILED", 1)
  assert.equal(result.reason, "MODEL_DOWNLOAD_FAILED")
  assert.equal(result.code, "WHISPER_DOWNLOAD_FAILED")
  assert.equal(result.exitCode, 1)
  assert.match(result.error, /CERTIFICATE_VERIFY_FAILED/)
})

test("classifyWhisperDownloadFailure keeps the renderer reason but adds a cause", () => {
  const cases = [
    ["ERROR: Failed to download Whisper model (permission_denied): Read-only file system", "PERMISSION_DENIED"],
    ["OSError: [Errno 28] No space left on device", "DISK_FULL"],
    ["SSLCertVerificationError: certificate verify failed", "TLS_ERROR"],
    ["requests.exceptions.ConnectionError: getaddrinfo failed", "NETWORK_UNAVAILABLE"],
    ["Whisper model download failed with HTTP 404", "HTTP_ERROR"],
    ["ModuleNotFoundError: No module named 'pywhispercpp'", "WHISPER_BACKEND_UNAVAILABLE"],
    ["something entirely unexpected", "UNKNOWN"],
  ]
  for (const [raw, cause] of cases) {
    const result = classifyWhisperDownloadFailure(raw, 1)
    assert.equal(result.reason, "MODEL_DOWNLOAD_FAILED", `reason for ${cause}`)
    assert.equal(result.cause, cause, `cause for ${raw}`)
    assert.ok(result.userMessage.length > 0)
  }
})

test("classifyWhisperDownloadFailure distinguishes a missing backend from a failed download", () => {
  const result = classifyWhisperDownloadFailure("spawn openscribe-backend ENOENT", null)
  assert.equal(result.code, "WHISPER_BACKEND_MISSING")
  assert.equal(result.reason, "BACKEND_MISSING")
  assert.notEqual(result.reason, "MODEL_DOWNLOAD_FAILED")
  assert.equal(result.retryable, false)
})

test("describeBackendBinaryPreflight accepts a runnable binary", () => {
  const result = describeBackendBinaryPreflight({
    path: "/tmp/openscribe-backend",
    exists: true,
    isFile: true,
    executable: true,
    quarantined: false,
  })
  assert.equal(result.ok, true)
  assert.equal(result.reason, "OK")
})

test("describeBackendBinaryPreflight reports missing, non-executable and quarantined binaries", () => {
  const missing = describeBackendBinaryPreflight({ path: "/tmp/x", exists: false })
  assert.equal(missing.ok, false)
  assert.equal(missing.code, "WHISPER_BACKEND_MISSING")

  const notExecutable = describeBackendBinaryPreflight({ path: "/tmp/x", exists: true, isFile: true, executable: false })
  assert.equal(notExecutable.code, "WHISPER_BACKEND_NOT_EXECUTABLE")

  const quarantined = describeBackendBinaryPreflight({
    path: "/tmp/x",
    exists: true,
    isFile: true,
    executable: true,
    quarantined: true,
    platform: "darwin",
  })
  assert.equal(quarantined.ok, false)
  assert.equal(quarantined.code, "WHISPER_BACKEND_QUARANTINED")
  assert.match(quarantined.userMessage, /xattr -dr com\.apple\.quarantine/)
})

test("resolveWhisperModelCacheDir prefers userData over anything in the app bundle", () => {
  const resolved = resolveWhisperModelCacheDir({
    userDataDir: "/Users/x/Library/Application Support/OpenScribe",
    homeDir: "/Users/x",
    platform: "darwin",
    env: {},
    pathJoin: (...parts) => parts.join("/"),
  })
  assert.equal(resolved.source, "userData")
  assert.equal(resolved.dir, "/Users/x/Library/Application Support/OpenScribe/whisper-models")
  assert.ok(!resolved.dir.includes(".app/Contents"))
})

test("resolveWhisperModelCacheDir honours an explicit override", () => {
  const resolved = resolveWhisperModelCacheDir({
    userDataDir: "/Users/x/Library/Application Support/OpenScribe",
    env: { [WHISPER_MODELS_DIR_ENV]: "/custom/models" },
  })
  assert.equal(resolved.source, "env")
  assert.equal(resolved.dir, "/custom/models")
})

test("resolveWhisperModelCacheDir falls back to the pywhispercpp location per platform", () => {
  const pathJoin = (...parts) => parts.join("/")
  assert.match(
    resolveWhisperModelCacheDir({ homeDir: "/Users/x", platform: "darwin", pathJoin }).dir,
    /Library\/Application Support\/pywhispercpp\/models$/,
  )
  assert.match(
    resolveWhisperModelCacheDir({ homeDir: "/home/x", platform: "linux", pathJoin }).dir,
    /\.local\/share\/pywhispercpp\/models$/,
  )
  assert.equal(resolveWhisperModelCacheDir({}).source, "none")
})

test("pickWhisperModelDirCandidates includes legacy locations so existing models are reused", () => {
  const candidates = pickWhisperModelDirCandidates({
    userDataDir: "/Users/x/Library/Application Support/OpenScribe",
    homeDir: "/Users/x",
    platform: "darwin",
    env: {},
    pathJoin: (...parts) => parts.join("/"),
  })
  assert.equal(candidates[0], "/Users/x/Library/Application Support/OpenScribe/whisper-models")
  assert.ok(candidates.includes("/Users/x/Library/Application Support/pywhispercpp/models"))
  assert.ok(candidates.includes("/Users/x/.cache/whisper"))
  assert.equal(new Set(candidates).size, candidates.length)
})

test("buildWhisperChildEnv pins the writable models dir for spawned backends", () => {
  const env = buildWhisperChildEnv({
    baseEnv: { PATH: "/usr/bin" },
    modelsDir: "/Users/x/Library/Application Support/OpenScribe/whisper-models",
  })
  assert.equal(env[WHISPER_MODELS_DIR_ENV], "/Users/x/Library/Application Support/OpenScribe/whisper-models")
  assert.equal(env.PATH, "/usr/bin")
  assert.equal(env.PYTHONUNBUFFERED, "1")
  assert.equal(env.WHISPER_LOCAL_MODEL, "tiny.en")
  assert.equal(env.OPENSCRIBE_WHISPER_MODEL, "tiny.en")
})

test("buildWhisperChildEnv does not override an explicit model choice", () => {
  const env = buildWhisperChildEnv({ baseEnv: { WHISPER_LOCAL_MODEL: "small.en" }, modelsDir: "/m" })
  assert.equal(env.WHISPER_LOCAL_MODEL, "small.en")
  assert.equal(env.OPENSCRIBE_WHISPER_MODEL, "small.en")
})

test("extractBackendFailureMessage surfaces stdout ERROR lines", () => {
  // The backend historically printed its reason to stdout while exiting
  // non-zero, so a stderr-only message hid the cause entirely (#56).
  const detail = extractBackendFailureMessage({
    stdout: "Downloading Whisper model: tiny.en\nERROR: Failed to download Whisper model (network_unavailable): getaddrinfo failed",
    stderr: "",
    exitCode: 1,
  })
  assert.match(detail, /network_unavailable/)
  assert.equal(classifyWhisperDownloadFailure(detail, 1).cause, "NETWORK_UNAVAILABLE")
})

test("extractBackendFailureMessage falls back to stderr then to a code summary", () => {
  assert.match(extractBackendFailureMessage({ stderr: "boom happened", exitCode: 2 }), /boom happened/)
  assert.match(extractBackendFailureMessage({ stdout: "just logs", exitCode: 2 }), /just logs/)
  assert.match(extractBackendFailureMessage({ exitCode: 3 }), /exited with code 3/)
  assert.match(extractBackendFailureMessage({}), /no output/)
})

test("isWhisperModelFileName matches ggml model files only", () => {
  assert.equal(isWhisperModelFileName("ggml-tiny.en.bin"), true)
  assert.equal(isWhisperModelFileName("GGML-BASE.BIN"), true)
  assert.equal(isWhisperModelFileName("ggml-tiny.en.bin.part"), false)
  assert.equal(isWhisperModelFileName("model.pt"), false)
})

test("sanitizeErrorMessage strips ANSI and truncates", () => {
  const raw = "[31mboom[0m \n with  spaces"
  assert.equal(sanitizeErrorMessage(raw, 20), "boom with spaces")
  assert.equal(sanitizeErrorMessage("x".repeat(50), 10), `${"x".repeat(10)}...`)
})
