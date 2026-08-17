/**
 * Pure helpers for the local Whisper runtime.
 *
 * Everything in this module must stay side-effect free so it can be unit tested
 * without Electron: see scripts/e2e/whisper-runtime-utils.test.mjs.
 */

const WHISPER_MODEL_FILE_PATTERN = /^ggml-.*\.bin$/i;
const WHISPER_MODELS_DIR_ENV = 'OPENSCRIBE_WHISPER_MODELS_DIR';

function stripAnsi(input) {
  return String(input || '').replace(
    // eslint-disable-next-line no-control-regex
    /\u001b\[[0-9;]*[a-zA-Z]/g,
    '',
  );
}

function sanitizeErrorMessage(input, maxLen = 700) {
  const cleaned = stripAnsi(input).replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return '';
  }
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}...` : cleaned;
}

function isWhisperModelFileName(name) {
  return WHISPER_MODEL_FILE_PATTERN.test(String(name || ''));
}

/**
 * Health-wait budget for the local Whisper service.
 *
 * The packaged backend builds its transcriber (which downloads the ggml model on
 * a first-ever run) *before* uvicorn binds the port, so `/health` cannot answer
 * until the download and model load have both finished. A cold start therefore
 * needs a budget measured in minutes, while a warm start should fail fast.
 *
 * `maxWaitMs` lets interactive IPC handlers cap the wait so the user gets a
 * retryable WHISPER_STARTING instead of a multi-minute frozen button, while the
 * background warmup keeps waiting for the full cold-start budget.
 */
function computeWhisperHealthWaitProfile({
  coldStart = false,
  reusedProcess = false,
  maxWaitMs = null,
} = {}) {
  let profile;
  if (coldStart) {
    profile = { timeoutMs: 180000, intervalMs: 1000, coldStart: true };
  } else if (reusedProcess) {
    profile = { timeoutMs: 15000, intervalMs: 500, coldStart: false };
  } else {
    profile = { timeoutMs: 6000, intervalMs: 250, coldStart: false };
  }

  if (Number.isFinite(maxWaitMs) && maxWaitMs > 0 && maxWaitMs < profile.timeoutMs) {
    return {
      ...profile,
      timeoutMs: maxWaitMs,
      intervalMs: Math.min(profile.intervalMs, Math.max(100, Math.floor(maxWaitMs / 10))),
      capped: true,
    };
  }
  return { ...profile, capped: false };
}

/**
 * Map a Node spawn error (or a captured backend message) onto a stable cause.
 * Returned causes are used for both health and download classification so the
 * user sees the same remediation regardless of which path failed.
 */
function classifyBackendSpawnFailure(errorLike) {
  const code = String(errorLike?.code || '').toUpperCase();
  const message = sanitizeErrorMessage(errorLike?.message || errorLike || '');
  const lower = message.toLowerCase();

  if (code === 'ENOENT' || lower.includes('no such file or directory') || lower.includes('enoent')) {
    return 'BACKEND_MISSING';
  }
  if (code === 'EACCES' || code === 'EPERM' || lower.includes('permission denied') || lower.includes('operation not permitted')) {
    return 'BACKEND_NOT_EXECUTABLE';
  }
  if (code === 'ENOEXEC' || lower.includes('exec format error') || lower.includes('bad cpu type')) {
    return 'BACKEND_ARCH_MISMATCH';
  }
  if (lower.includes('killed') || lower.includes('sigkill')) {
    return 'BACKEND_KILLED';
  }
  return '';
}

function describeBackendSpawnCause(cause, { path = '', platform = process.platform } = {}) {
  const target = path ? ` (${path})` : '';
  const quarantineHint = platform === 'darwin'
    ? ' macOS may have quarantined it: run `xattr -dr com.apple.quarantine /Applications/OpenScribe.app` and reopen the app.'
    : '';

  switch (cause) {
    case 'BACKEND_MISSING':
      return {
        code: 'WHISPER_BACKEND_MISSING',
        reason: 'BACKEND_MISSING',
        retryable: false,
        error: `OpenScribe backend executable was not found${target}`,
        userMessage: 'The bundled OpenScribe backend is missing from this install. Reinstall OpenScribe from the official release.',
      };
    case 'BACKEND_NOT_EXECUTABLE':
      return {
        code: 'WHISPER_BACKEND_NOT_EXECUTABLE',
        reason: 'BACKEND_NOT_EXECUTABLE',
        retryable: false,
        error: `OpenScribe backend executable cannot be launched${target}`,
        userMessage: `The bundled OpenScribe backend is not allowed to run.${quarantineHint}`,
      };
    case 'BACKEND_ARCH_MISMATCH':
      return {
        code: 'WHISPER_BACKEND_ARCH_MISMATCH',
        reason: 'BACKEND_ARCH_MISMATCH',
        retryable: false,
        error: `OpenScribe backend executable is built for a different CPU architecture${target}`,
        userMessage: 'This OpenScribe build does not match your CPU architecture. Download the build for your Mac (Apple Silicon vs Intel).',
      };
    case 'BACKEND_KILLED':
      return {
        code: 'WHISPER_BACKEND_KILLED',
        reason: 'BACKEND_KILLED',
        retryable: true,
        error: `OpenScribe backend executable was terminated by the operating system${target}`,
        userMessage: `The OpenScribe backend was terminated by macOS before it could start.${quarantineHint}`,
      };
    default:
      return null;
  }
}

/**
 * Decide what a failed health wait means. A live process that has not exited is
 * still starting (retryable), a spawn failure is a broken install, and anything
 * else is genuinely unhealthy.
 */
function classifyWhisperHealthTimeout({
  processRunning = false,
  lastExitCode = null,
  host = '127.0.0.1',
  port = 8002,
  spawnError = null,
  backendPath = '',
  platform = process.platform,
  modelPresent = null,
  timeoutMs = null,
} = {}) {
  if (spawnError) {
    const cause = classifyBackendSpawnFailure(spawnError);
    const described = describeBackendSpawnCause(cause, { path: backendPath, platform });
    if (described) {
      return { ...described, cause };
    }
    return {
      code: 'WHISPER_UNHEALTHY',
      reason: 'UNHEALTHY',
      retryable: true,
      cause: 'SPAWN_FAILED',
      error: sanitizeErrorMessage(spawnError?.message || spawnError) || 'Whisper service failed to spawn',
      userMessage: 'Whisper service failed to start. Retry in a few seconds or restart OpenScribe.',
    };
  }

  if (processRunning && (lastExitCode === null || lastExitCode === undefined)) {
    const downloading = modelPresent === false;
    return {
      code: 'WHISPER_STARTING',
      reason: 'STARTING',
      retryable: true,
      cause: downloading ? 'MODEL_DOWNLOAD_IN_PROGRESS' : 'LOADING_MODEL',
      userMessage: downloading
        ? 'Whisper is downloading its speech model in the background (one-time, ~75 MB). Retry in a minute.'
        : 'Whisper is still initializing. Retry in a few seconds.',
      error: `Whisper service is still starting on ${host}:${port}`
        + (Number.isFinite(timeoutMs) ? ` (waited ${Math.round(timeoutMs / 1000)}s)` : ''),
    };
  }

  return {
    code: 'WHISPER_UNHEALTHY',
    reason: 'UNHEALTHY',
    retryable: true,
    cause: lastExitCode === null || lastExitCode === undefined ? 'NO_PROCESS' : 'PROCESS_EXITED',
    userMessage: 'Whisper service is not healthy. Retry in a few seconds or restart OpenScribe.',
    error: `Whisper service failed health check on ${host}:${port}`
      + (lastExitCode === null || lastExitCode === undefined ? '' : ` (backend exited with code ${lastExitCode})`),
  };
}

const DOWNLOAD_FAILURE_CAUSES = [
  {
    // Checked first: a broken bundle produces import errors whose text overlaps
    // the network patterns below ("ModuleNotFoundError" contains "enotfound").
    cause: 'WHISPER_BACKEND_UNAVAILABLE',
    test: /no whisper backend available|pywhispercpp|modulenotfounderror|importerror|no module named/i,
    userMessage: 'The bundled Whisper engine could not be loaded. Reinstall OpenScribe from the official release.',
  },
  {
    cause: 'PERMISSION_DENIED',
    test: /permission denied|read-only file system|operation not permitted|errno 13|errno 30|eacces|eperm/i,
    userMessage: 'OpenScribe could not write the Whisper model to disk. Grant Full Disk Access to OpenScribe or move the app to /Applications and retry.',
  },
  {
    cause: 'DISK_FULL',
    test: /no space left|errno 28|enospc|disk full/i,
    userMessage: 'There is not enough free disk space for the Whisper model (~75 MB needed). Free some space and retry.',
  },
  {
    cause: 'TLS_ERROR',
    test: /certificate_verify_failed|ssl(?:error|:)|certificate verify failed|sslcertverificationerror/i,
    userMessage: 'The Whisper model download failed TLS verification. A corporate proxy or VPN is likely intercepting HTTPS traffic; disable it and retry.',
  },
  {
    cause: 'NETWORK_UNAVAILABLE',
    test: /getaddrinfo|name or service not known|temporary failure in name resolution|nodename nor servname|connection refused|connection reset|network is unreachable|timed out|timeout|max retries exceeded|\beconnreset\b|\benotfound\b/i,
    userMessage: 'The Whisper model download could not reach huggingface.co. Check your network connection or proxy settings and retry.',
  },
  {
    cause: 'HTTP_ERROR',
    test: /http \d{3}|status code: ?\d{3}|403 forbidden|404 not found|502 bad gateway|503 service unavailable/i,
    userMessage: 'huggingface.co rejected the Whisper model download. Retry in a few minutes, or install the model manually.',
  },
];

/**
 * Turn a raw backend failure into an actionable download error. `reason` stays
 * MODEL_DOWNLOAD_FAILED for every recoverable case so the renderer contract
 * does not change; `cause` carries the specific diagnosis.
 */
function classifyWhisperDownloadFailure(rawErrorMessage = '', exitCode = null) {
  const error = sanitizeErrorMessage(rawErrorMessage);

  const spawnCause = classifyBackendSpawnFailure({ message: error });
  if (spawnCause === 'BACKEND_MISSING' || spawnCause === 'BACKEND_ARCH_MISMATCH') {
    const described = describeBackendSpawnCause(spawnCause, {});
    return {
      ...described,
      cause: spawnCause,
      exitCode,
      error: error || described.error,
    };
  }

  const matched = DOWNLOAD_FAILURE_CAUSES.find((entry) => entry.test.test(error));
  return {
    code: 'WHISPER_DOWNLOAD_FAILED',
    reason: 'MODEL_DOWNLOAD_FAILED',
    cause: matched ? matched.cause : 'UNKNOWN',
    retryable: true,
    exitCode,
    error: error || 'Failed to download Whisper model',
    userMessage: matched
      ? matched.userMessage
      : 'Whisper model download failed. Check your network connection and retry.',
  };
}

/**
 * Preflight verdict for the bundled backend executable. Callers do the fs/xattr
 * probing and pass the observations in so this stays pure.
 */
function describeBackendBinaryPreflight({
  path: backendPath = '',
  exists = false,
  isFile = false,
  executable = false,
  quarantined = false,
  platform = process.platform,
} = {}) {
  if (!exists || !isFile) {
    return {
      ok: false,
      ...describeBackendSpawnCause('BACKEND_MISSING', { path: backendPath, platform }),
      cause: 'BACKEND_MISSING',
    };
  }
  if (!executable) {
    return {
      ok: false,
      ...describeBackendSpawnCause('BACKEND_NOT_EXECUTABLE', { path: backendPath, platform }),
      cause: 'BACKEND_NOT_EXECUTABLE',
    };
  }
  if (quarantined) {
    return {
      ok: false,
      code: 'WHISPER_BACKEND_QUARANTINED',
      reason: 'BACKEND_QUARANTINED',
      cause: 'BACKEND_QUARANTINED',
      retryable: false,
      error: `OpenScribe backend executable is quarantined by macOS (${backendPath})`,
      userMessage: 'macOS quarantined the bundled OpenScribe backend, so it cannot start. Run `xattr -dr com.apple.quarantine /Applications/OpenScribe.app` in Terminal, then reopen OpenScribe.',
    };
  }
  return { ok: true, code: 'BACKEND_OK', reason: 'OK', cause: '', retryable: true, error: '', userMessage: '' };
}

/**
 * Writable cache directory for ggml Whisper models.
 *
 * Never derive this from the app bundle: on a signed/hardened macOS app the
 * bundle is read-only, so a download that targets it fails with EACCES/EROFS.
 */
function resolveWhisperModelCacheDir({
  userDataDir = '',
  homeDir = '',
  platform = process.platform,
  env = {},
  pathJoin = (...parts) => parts.filter(Boolean).join('/'),
} = {}) {
  const override = String(env[WHISPER_MODELS_DIR_ENV] || '').trim();
  if (override) {
    return { dir: override, source: 'env' };
  }
  if (userDataDir) {
    return { dir: pathJoin(userDataDir, 'whisper-models'), source: 'userData' };
  }
  if (homeDir && platform === 'darwin') {
    return { dir: pathJoin(homeDir, 'Library', 'Application Support', 'pywhispercpp', 'models'), source: 'pywhispercpp' };
  }
  if (homeDir && platform === 'win32') {
    return { dir: pathJoin(homeDir, 'AppData', 'Local', 'pywhispercpp', 'models'), source: 'pywhispercpp' };
  }
  if (homeDir) {
    return { dir: pathJoin(homeDir, '.local', 'share', 'pywhispercpp', 'models'), source: 'pywhispercpp' };
  }
  return { dir: '', source: 'none' };
}

/**
 * Every directory a previously downloaded ggml model could live in, most
 * specific first. Used to decide whether a start is a cold start.
 */
function pickWhisperModelDirCandidates({
  userDataDir = '',
  homeDir = '',
  platform = process.platform,
  env = {},
  pathJoin = (...parts) => parts.filter(Boolean).join('/'),
} = {}) {
  const candidates = [];
  const push = (dir) => {
    if (dir && !candidates.includes(dir)) candidates.push(dir);
  };

  push(resolveWhisperModelCacheDir({ userDataDir, homeDir, platform, env, pathJoin }).dir);
  if (userDataDir) push(pathJoin(userDataDir, 'whisper-models'));
  if (homeDir) {
    if (platform === 'darwin') {
      push(pathJoin(homeDir, 'Library', 'Application Support', 'pywhispercpp', 'models'));
    }
    if (platform === 'win32') {
      push(pathJoin(homeDir, 'AppData', 'Local', 'pywhispercpp', 'models'));
    }
    push(pathJoin(homeDir, '.local', 'share', 'pywhispercpp', 'models'));
    push(pathJoin(homeDir, '.cache', 'pywhispercpp', 'models'));
    push(pathJoin(homeDir, '.cache', 'whisper'));
  }
  return candidates;
}

/**
 * Environment for every spawned backend process that touches Whisper. Pinning
 * the models dir here is what keeps the download out of the read-only bundle.
 */
function buildWhisperChildEnv({
  baseEnv = {},
  modelsDir = '',
  model = '',
  backend = '',
  gpu = '',
} = {}) {
  const env = { ...baseEnv, PYTHONUNBUFFERED: '1' };
  if (modelsDir) {
    env[WHISPER_MODELS_DIR_ENV] = modelsDir;
  }
  env.WHISPER_LOCAL_MODEL = baseEnv.WHISPER_LOCAL_MODEL || model || 'tiny.en';
  env.WHISPER_LOCAL_BACKEND = baseEnv.WHISPER_LOCAL_BACKEND || backend || 'cpp';
  env.WHISPER_LOCAL_GPU = baseEnv.WHISPER_LOCAL_GPU || gpu || '1';
  env.OPENSCRIBE_WHISPER_MODEL = env.WHISPER_LOCAL_MODEL;
  env.OPENSCRIBE_WHISPER_BACKEND = env.WHISPER_LOCAL_BACKEND;
  return env;
}

/**
 * The backend prints its real failure reason to stdout (`ERROR: ...`) while
 * exiting non-zero, so a stderr-only error message hides the cause entirely.
 */
function extractBackendFailureMessage({ stdout = '', stderr = '', exitCode = null } = {}) {
  const cleanStderr = sanitizeErrorMessage(stderr, 2000);
  const cleanStdout = sanitizeErrorMessage(stdout, 2000);

  const errorLines = `${stderr}\n${stdout}`
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(?:ERROR|Traceback|[A-Za-z_]*Error:|WhisperModelError)/.test(line));

  if (errorLines.length > 0) {
    return sanitizeErrorMessage(errorLines.join(' | '));
  }
  if (cleanStderr) {
    return cleanStderr;
  }
  if (cleanStdout) {
    return cleanStdout;
  }
  return exitCode === null || exitCode === undefined
    ? 'Backend produced no output'
    : `Backend exited with code ${exitCode} and produced no output`;
}

module.exports = {
  WHISPER_MODELS_DIR_ENV,
  sanitizeErrorMessage,
  isWhisperModelFileName,
  computeWhisperHealthWaitProfile,
  classifyBackendSpawnFailure,
  classifyWhisperHealthTimeout,
  classifyWhisperDownloadFailure,
  describeBackendBinaryPreflight,
  resolveWhisperModelCacheDir,
  pickWhisperModelDirCandidates,
  buildWhisperChildEnv,
  extractBackendFailureMessage,
};
