/**
 * Transcription language allowlist shared by the Settings UI and the
 * transcription API routes.
 *
 * Precedence (see docs/TRANSCRIPTION-LANGUAGE.md):
 *   1. UI selection, when it is a supported code other than "auto"
 *   2. `WHISPER_LANGUAGE` environment variable
 *   3. Whisper auto-detect ("auto"), or English for `.en` models
 *
 * Whisper language codes are a fixed set, so every value that crosses a
 * trust boundary is checked against this allowlist. Unsupported values are
 * either collapsed to "auto" (`normalizeTranscriptionLanguage`) or rejected
 * (`assertTranscriptionLanguage`) — they are never forwarded raw.
 */

export const AUTO_TRANSCRIPTION_LANGUAGE = "auto"

export interface TranscriptionLanguageOption {
  /** ISO-639-1 code understood by Whisper, or "auto" for auto-detect. */
  code: string
  label: string
}

export const TRANSCRIPTION_LANGUAGE_OPTIONS: readonly TranscriptionLanguageOption[] = [
  { code: AUTO_TRANSCRIPTION_LANGUAGE, label: "Auto (default)" },
  { code: "en", label: "English" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "pt", label: "Portuguese" },
  { code: "zh", label: "Chinese" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
]

export const SUPPORTED_TRANSCRIPTION_LANGUAGES: readonly string[] = TRANSCRIPTION_LANGUAGE_OPTIONS.map(
  (option) => option.code,
)

/** Thrown when a caller supplies a language that is not on the allowlist. */
export class InvalidTranscriptionLanguageError extends Error {
  readonly received: string

  constructor(received: string) {
    super(
      `Unsupported transcription language "${received}". ` +
        `Supported values: ${SUPPORTED_TRANSCRIPTION_LANGUAGES.join(", ")}.`,
    )
    this.name = "InvalidTranscriptionLanguageError"
    this.received = received
  }
}

function canonicalize(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function isSupportedTranscriptionLanguage(value: unknown): boolean {
  const candidate = canonicalize(value)
  return candidate.length > 0 && SUPPORTED_TRANSCRIPTION_LANGUAGES.includes(candidate)
}

/**
 * Safe coercion. Anything missing, malformed, or unsupported collapses to
 * "auto" so a corrupted preference can never break transcription.
 */
export function normalizeTranscriptionLanguage(value: unknown): string {
  const candidate = canonicalize(value)
  return SUPPORTED_TRANSCRIPTION_LANGUAGES.includes(candidate) ? candidate : AUTO_TRANSCRIPTION_LANGUAGE
}

/**
 * Strict coercion for request boundaries. Throws so the caller can answer
 * with an explicit validation error instead of silently transcribing in the
 * wrong language.
 */
export function assertTranscriptionLanguage(value: unknown): string {
  if (!isSupportedTranscriptionLanguage(value)) {
    throw new InvalidTranscriptionLanguageError(typeof value === "string" ? value : String(value))
  }
  return canonicalize(value)
}

/**
 * Turn a UI selection into the per-request Whisper override.
 * Returns undefined for "auto" (and for anything unsupported) so the
 * existing `WHISPER_LANGUAGE` / auto-detect behaviour stays untouched.
 */
export function toWhisperLanguageOverride(value: unknown): string | undefined {
  const normalized = normalizeTranscriptionLanguage(value)
  return normalized === AUTO_TRANSCRIPTION_LANGUAGE ? undefined : normalized
}

/**
 * Precedence for a single transcription request:
 *   request value (the UI selection) > session-registered value > no override.
 * "No override" means the server keeps using `WHISPER_LANGUAGE` / auto-detect.
 *
 * Throws {@link InvalidTranscriptionLanguageError} when the request carries a
 * value that is present but unsupported, so the caller can answer 400 instead
 * of transcribing in an unintended language.
 */
export function resolveTranscriptionLanguageOverride(
  requestValue: unknown,
  sessionValue?: unknown,
): string | undefined {
  if (requestValue === null || requestValue === undefined) {
    return toWhisperLanguageOverride(sessionValue)
  }
  if (typeof requestValue !== "string") {
    throw new InvalidTranscriptionLanguageError(String(requestValue))
  }
  if (requestValue.trim().length === 0) {
    return toWhisperLanguageOverride(sessionValue)
  }
  return toWhisperLanguageOverride(assertTranscriptionLanguage(requestValue))
}

export function transcriptionLanguageLabel(value: unknown): string {
  const normalized = normalizeTranscriptionLanguage(value)
  const option = TRANSCRIPTION_LANGUAGE_OPTIONS.find((entry) => entry.code === normalized)
  return option ? option.label : "Auto (default)"
}
