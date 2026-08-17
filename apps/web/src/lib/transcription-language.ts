/**
 * Server-side resolution of the transcription language for one request.
 *
 * Precedence, highest first:
 *   1. `language` field on the transcription request (the UI selection)
 *   2. Language registered for the session via POST /api/transcription/language
 *   3. `WHISPER_LANGUAGE` env var / Whisper auto-detect (handled downstream)
 *
 * When the resolved value is "auto" we return `undefined`, which means the
 * existing env-driven behaviour in the transcribe providers is untouched.
 */

import {
  InvalidTranscriptionLanguageError,
  assertTranscriptionLanguage,
  resolveTranscriptionLanguageOverride,
} from "@ui/lib/transcription-languages"
import {
  transcribeWithResolvedProvider,
  transcribeWithWhisperLocal,
  type ResolvedTranscriptionProvider,
} from "@transcription"

/** Bound the in-memory registry so a long-lived server cannot grow unbounded. */
const MAX_TRACKED_SESSIONS = 200

const sessionLanguages = new Map<string, string>()

export function rememberSessionTranscriptionLanguage(sessionId: string, language: unknown): string {
  const validated = assertTranscriptionLanguage(language)
  sessionLanguages.delete(sessionId)
  sessionLanguages.set(sessionId, validated)
  while (sessionLanguages.size > MAX_TRACKED_SESSIONS) {
    const oldest = sessionLanguages.keys().next()
    if (oldest.done) break
    sessionLanguages.delete(oldest.value)
  }
  return validated
}

export function getSessionTranscriptionLanguage(sessionId: string): string | undefined {
  return sessionLanguages.get(sessionId)
}

export function forgetSessionTranscriptionLanguage(sessionId: string): void {
  sessionLanguages.delete(sessionId)
}

/**
 * Resolve the Whisper language override for a transcription request.
 * Throws {@link InvalidTranscriptionLanguageError} when the client sends a
 * value that is not on the allowlist so the route can answer 400 instead of
 * forwarding an unvalidated value to the backend.
 */
export function resolveRequestTranscriptionLanguage(sessionId: string, requestValue: unknown): string | undefined {
  const override = resolveTranscriptionLanguageOverride(requestValue, sessionLanguages.get(sessionId))
  if (typeof requestValue === "string" && requestValue.trim().length > 0) {
    rememberSessionTranscriptionLanguage(sessionId, requestValue)
  }
  return override
}

/**
 * Transcribe with an explicit per-request language when the resolved provider
 * supports it. `whisper_local` accepts a `language` option that is forwarded to
 * the local Whisper server; the hosted OpenAI and MedASR providers remain
 * env-configured (`WHISPER_LANGUAGE`).
 */
export async function transcribeWithLanguage(
  buffer: Buffer,
  filename: string,
  resolved: ResolvedTranscriptionProvider,
  language?: string,
): Promise<string> {
  if (!language) {
    return transcribeWithResolvedProvider(buffer, filename, resolved)
  }

  if (resolved.provider !== "whisper_local") {
    console.warn(
      `[transcription.language] Provider "${resolved.provider}" cannot be overridden per request; ` +
        `falling back to WHISPER_LANGUAGE for language "${language}".`,
    )
    return transcribeWithResolvedProvider(buffer, filename, resolved)
  }

  if (resolved.model.endsWith(".en") && language !== "en") {
    console.warn(
      `[transcription.language] Selected language "${language}" is ignored because model ` +
        `"${resolved.model}" is English-only. Set WHISPER_LOCAL_MODEL to a multilingual model (e.g. base, small).`,
    )
  }

  return transcribeWithWhisperLocal(buffer, filename, { model: resolved.model, language })
}

export { InvalidTranscriptionLanguageError }
