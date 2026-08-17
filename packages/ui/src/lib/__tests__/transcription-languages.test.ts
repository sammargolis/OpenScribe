import assert from "node:assert/strict"
import test from "node:test"
import {
  AUTO_TRANSCRIPTION_LANGUAGE,
  InvalidTranscriptionLanguageError,
  SUPPORTED_TRANSCRIPTION_LANGUAGES,
  TRANSCRIPTION_LANGUAGE_OPTIONS,
  assertTranscriptionLanguage,
  isSupportedTranscriptionLanguage,
  normalizeTranscriptionLanguage,
  resolveTranscriptionLanguageOverride,
  toWhisperLanguageOverride,
  transcriptionLanguageLabel,
} from "../transcription-languages.js"
import { getPreferences, setPreferences } from "../../../../storage/src/preferences.js"
import { flushAuditQueue } from "../../../../storage/src/audit-log.js"

// --- Option list -----------------------------------------------------------

test("language options start with Auto and expose unique codes", () => {
  assert.equal(TRANSCRIPTION_LANGUAGE_OPTIONS[0].code, AUTO_TRANSCRIPTION_LANGUAGE)
  assert.equal(TRANSCRIPTION_LANGUAGE_OPTIONS[0].label, "Auto (default)")
  assert.equal(new Set(SUPPORTED_TRANSCRIPTION_LANGUAGES).size, SUPPORTED_TRANSCRIPTION_LANGUAGES.length)
  for (const option of TRANSCRIPTION_LANGUAGE_OPTIONS) {
    assert.match(option.code, /^(?:auto|[a-z]{2})$/)
    assert.ok(option.label.length > 0)
  }
})

test("common non-English languages are selectable", () => {
  for (const code of ["en", "es", "fr", "de", "pt", "zh", "hi", "ar"]) {
    assert.ok(isSupportedTranscriptionLanguage(code), `${code} should be supported`)
  }
})

// --- Default (Auto) behaviour ----------------------------------------------

test("auto default produces no override so env/auto-detect behaviour is unchanged", () => {
  assert.equal(normalizeTranscriptionLanguage(AUTO_TRANSCRIPTION_LANGUAGE), AUTO_TRANSCRIPTION_LANGUAGE)
  assert.equal(toWhisperLanguageOverride(AUTO_TRANSCRIPTION_LANGUAGE), undefined)
  assert.equal(toWhisperLanguageOverride(undefined), undefined)
  assert.equal(toWhisperLanguageOverride(null), undefined)
  assert.equal(toWhisperLanguageOverride(""), undefined)
  assert.equal(toWhisperLanguageOverride("   "), undefined)
})

// --- Explicit selection ----------------------------------------------------

test("explicit non-English selection becomes a Whisper override", () => {
  assert.equal(toWhisperLanguageOverride("es"), "es")
  assert.equal(toWhisperLanguageOverride("ZH"), "zh")
  assert.equal(toWhisperLanguageOverride("  ar  "), "ar")
  assert.equal(assertTranscriptionLanguage("fr"), "fr")
  assert.equal(transcriptionLanguageLabel("es"), "Spanish")
})

test("explicit English selection is forwarded as en", () => {
  assert.equal(toWhisperLanguageOverride("en"), "en")
  assert.equal(transcriptionLanguageLabel("en"), "English")
})

// --- Fallback / rejection of invalid values --------------------------------

test("unsupported values fall back to auto instead of being passed through", () => {
  for (const value of ["klingon", "xx", "en-US", "es; DROP TABLE", 42, {}, [], true, null, undefined]) {
    assert.equal(normalizeTranscriptionLanguage(value), AUTO_TRANSCRIPTION_LANGUAGE)
    assert.equal(toWhisperLanguageOverride(value), undefined)
  }
})

test("assertTranscriptionLanguage rejects unsupported values with a clear error", () => {
  assert.throws(
    () => assertTranscriptionLanguage("klingon"),
    (error: unknown) => {
      assert.ok(error instanceof InvalidTranscriptionLanguageError)
      assert.equal(error.received, "klingon")
      assert.match(error.message, /Unsupported transcription language/)
      assert.match(error.message, /auto, en, es/)
      return true
    },
  )
  assert.throws(() => assertTranscriptionLanguage(undefined), InvalidTranscriptionLanguageError)
  assert.throws(() => assertTranscriptionLanguage(""), InvalidTranscriptionLanguageError)
  assert.throws(() => assertTranscriptionLanguage(7), InvalidTranscriptionLanguageError)
})

// --- Request precedence ----------------------------------------------------

test("request precedence: request value wins over the session value", () => {
  assert.equal(resolveTranscriptionLanguageOverride("de", "es"), "de")
  assert.equal(resolveTranscriptionLanguageOverride("es", undefined), "es")
})

test("request precedence: session value applies when the request omits language", () => {
  assert.equal(resolveTranscriptionLanguageOverride(null, "fr"), "fr")
  assert.equal(resolveTranscriptionLanguageOverride(undefined, "fr"), "fr")
  assert.equal(resolveTranscriptionLanguageOverride("", "fr"), "fr")
})

test("request precedence: auto anywhere means no override, so env/auto-detect wins", () => {
  assert.equal(resolveTranscriptionLanguageOverride("auto", "es"), undefined)
  assert.equal(resolveTranscriptionLanguageOverride(null, "auto"), undefined)
  assert.equal(resolveTranscriptionLanguageOverride(null, null), undefined)
  assert.equal(resolveTranscriptionLanguageOverride(undefined, undefined), undefined)
})

test("request precedence: unsupported request values are rejected, not forwarded", () => {
  assert.throws(() => resolveTranscriptionLanguageOverride("klingon", "es"), InvalidTranscriptionLanguageError)
  assert.throws(() => resolveTranscriptionLanguageOverride("en-GB"), InvalidTranscriptionLanguageError)
  assert.throws(() => resolveTranscriptionLanguageOverride(new Blob(["x"])), InvalidTranscriptionLanguageError)
})

test("request precedence: an unsupported session value degrades to no override", () => {
  assert.equal(resolveTranscriptionLanguageOverride(null, "klingon"), undefined)
})

// --- Persistence and restore ----------------------------------------------

interface StubStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
  clear(): void
}

function installLocalStorageStub(): StubStorage {
  const entries = new Map<string, string>()
  const storage: StubStorage = {
    getItem: (key) => (entries.has(key) ? (entries.get(key) as string) : null),
    setItem: (key, value) => {
      entries.set(key, value)
    },
    removeItem: (key) => {
      entries.delete(key)
    },
    clear: () => entries.clear(),
  }
  ;(globalThis as { window?: unknown }).window = { localStorage: storage }
  return storage
}

function removeLocalStorageStub(): void {
  delete (globalThis as { window?: unknown }).window
}

test("transcriptionLanguage defaults to auto when nothing is stored", () => {
  installLocalStorageStub()
  try {
    assert.equal(normalizeTranscriptionLanguage(getPreferences().transcriptionLanguage), AUTO_TRANSCRIPTION_LANGUAGE)
  } finally {
    removeLocalStorageStub()
  }
})

test("selected language persists to storage and is restored on reload", async () => {
  const storage = installLocalStorageStub()
  try {
    await setPreferences({ transcriptionLanguage: "es" })
    // Persisted payload keeps the code, not a label.
    const raw = storage.getItem("openscribe_preferences")
    assert.ok(raw)
    assert.equal((JSON.parse(raw as string) as { transcriptionLanguage?: string }).transcriptionLanguage, "es")

    // Simulate a reload: fresh read of the same storage.
    assert.equal(getPreferences().transcriptionLanguage, "es")
    assert.equal(toWhisperLanguageOverride(getPreferences().transcriptionLanguage), "es")
  } finally {
    await flushAuditQueue().catch(() => {})
    removeLocalStorageStub()
  }
})

test("a corrupted stored language degrades to auto rather than reaching the backend", () => {
  const storage = installLocalStorageStub()
  try {
    storage.setItem(
      "openscribe_preferences",
      JSON.stringify({ noteLength: "long", processingMode: "mixed", transcriptionLanguage: "not-a-language" }),
    )
    const stored = getPreferences().transcriptionLanguage
    assert.equal(stored, "not-a-language")
    assert.equal(normalizeTranscriptionLanguage(stored), AUTO_TRANSCRIPTION_LANGUAGE)
    assert.equal(toWhisperLanguageOverride(stored), undefined)
  } finally {
    removeLocalStorageStub()
  }
})
