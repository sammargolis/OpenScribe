import assert from "node:assert/strict"
import test, { after, beforeEach } from "node:test"
import { getPreferences, setPreferences } from "../preferences.js"
import { flushAuditQueue } from "../audit-log.js"

/**
 * Note Template Preference Persistence Tests
 *
 * Verifies that noteTemplateId / customNoteTemplate round-trip through
 * localStorage so the Settings selection survives reload and app restart.
 *
 * NOTE: the repo's `pnpm test:run` script currently excludes every test under
 * packages/storage/src/__tests__. Run this file directly with:
 *   pnpm build:test && node --test build/tests-dist/storage/src/__tests__/note-template-preferences.test.js
 */

const PREFERENCES_KEY = "openscribe_preferences"

function installFakeWindow(): Map<string, string> {
  const store = new Map<string, string>()
  const localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value))
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size
    },
  }

  ;(globalThis as any).window = { localStorage }
  ;(globalThis as any).localStorage = localStorage

  return store
}

// The storage modules only touch `window` at call time, so installing the fake
// after the imports is safe.
const store = installFakeWindow()

beforeEach(() => {
  store.clear()
})

after(async () => {
  // Drain the audit queue so its pending flush timer does not keep the
  // test process alive. Failures here are irrelevant to this suite.
  try {
    await flushAuditQueue()
  } catch {}
})

test("note template preferences default to the default preset with empty custom markdown", () => {
  const prefs = getPreferences()

  assert.equal(prefs.noteTemplateId, "default")
  assert.equal(prefs.customNoteTemplate, "")
})

test("setPreferences persists the selected note template id", async () => {
  await setPreferences({ noteTemplateId: "soap" })

  assert.equal(getPreferences().noteTemplateId, "soap")

  const raw = JSON.parse(store.get(PREFERENCES_KEY)!)
  assert.equal(raw.noteTemplateId, "soap")
})

test("setPreferences persists custom note template markdown", async () => {
  const customNoteTemplate = "# Custom Note\n\n## Reason for Visit\n\n## Plan\n"

  await setPreferences({ noteTemplateId: "custom", customNoteTemplate })

  const prefs = getPreferences()
  assert.equal(prefs.noteTemplateId, "custom")
  assert.equal(prefs.customNoteTemplate, customNoteTemplate)
})

test("note template preferences survive a simulated reload", async () => {
  const customNoteTemplate = "# Reload Note\n\n## Assessment\n"

  await setPreferences({ noteTemplateId: "custom", customNoteTemplate })

  // Simulate a reload: same persisted bytes, fresh read.
  const persisted = store.get(PREFERENCES_KEY)!
  store.clear()
  store.set(PREFERENCES_KEY, persisted)

  const prefs = getPreferences()
  assert.equal(prefs.noteTemplateId, "custom")
  assert.equal(prefs.customNoteTemplate, customNoteTemplate)
})

test("note template preferences do not clobber other preferences", async () => {
  await setPreferences({ noteLength: "short" })
  await setPreferences({ noteTemplateId: "soap" })

  const prefs = getPreferences()
  assert.equal(prefs.noteLength, "short")
  assert.equal(prefs.noteTemplateId, "soap")
})

test("legacy preferences without template fields fall back to the default preset", () => {
  store.set(PREFERENCES_KEY, JSON.stringify({ noteLength: "long", processingMode: "mixed" }))

  const prefs = getPreferences()
  assert.equal(prefs.noteTemplateId, "default")
  assert.equal(prefs.customNoteTemplate, "")
})
