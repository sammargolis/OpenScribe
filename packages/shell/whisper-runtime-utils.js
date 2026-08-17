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

function computeWhisperHealthWaitProfile({ coldStart = false } = {}) {
  if (coldStart) {
    return { timeoutMs: 45000, intervalMs: 500 };
  }
  return { timeoutMs: 6000, intervalMs: 250 };
}

function classifyWhisperHealthTimeout({ processRunning = false, lastExitCode = null, host = '127.0.0.1', port = 8002 } = {}) {
  if (processRunning && (lastExitCode === null || lastExitCode === undefined)) {
    return {
      code: 'WHISPER_STARTING',
      reason: 'STARTING',
      retryable: true,
      userMessage: 'Whisper is still initializing. Retry in a few seconds.',
      error: `Whisper service is still starting on ${host}:${port}`,
    };
  }

  return {
    code: 'WHISPER_UNHEALTHY',
    reason: 'UNHEALTHY',
    retryable: true,
    userMessage: 'Whisper service is not healthy. Retry in a few seconds or restart OpenScribe.',
    error: `Whisper service failed health check on ${host}:${port}`,
  };
}

function classifyWhisperDownloadFailure(rawErrorMessage = '', exitCode = null) {
  return {
    code: 'WHISPER_DOWNLOAD_FAILED',
    reason: 'MODEL_DOWNLOAD_FAILED',
    retryable: true,
    exitCode,
    error: sanitizeErrorMessage(rawErrorMessage) || 'Failed to download Whisper model',
    userMessage: 'Whisper model download failed. Check your network connection and retry.',
  };
}

module.exports = {
  sanitizeErrorMessage,
  computeWhisperHealthWaitProfile,
  classifyWhisperHealthTimeout,
  classifyWhisperDownloadFailure,
};
