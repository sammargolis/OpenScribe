import assert from "node:assert/strict"
import test from "node:test"
import { createClinicalNoteText } from "../note-generator.js"
import { parseMarkdownNote } from "../clinical-models/markdown-note.js"

/**
 * Provider-configurable note generation tests
 *
 * These verify that createClinicalNoteText goes through the note model wrapper
 * (packages/llm/src/note-model) rather than a provider SDK directly, that the
 * NOTE_MODEL_* env config actually switches the outgoing request, and that the
 * error surface is unchanged when a non-default provider fails.
 */

const NOTE_MODEL_ENV = ["NOTE_MODEL_PROVIDER", "NOTE_MODEL_BASE_URL", "NOTE_MODEL_NAME", "NOTE_MODEL_API_KEY"] as const

function withOpenAICompatibleEnv(
  overrides: Partial<Record<(typeof NOTE_MODEL_ENV)[number], string | undefined>> = {},
): () => void {
  const original = new Map<string, string | undefined>()
  for (const key of NOTE_MODEL_ENV) {
    original.set(key, process.env[key])
  }

  const values: Record<string, string | undefined> = {
    NOTE_MODEL_PROVIDER: "vllm",
    NOTE_MODEL_BASE_URL: "https://llm.example.org/v1",
    NOTE_MODEL_NAME: "qwen2.5-72b-instruct",
    NOTE_MODEL_API_KEY: "provider-key",
    ...overrides,
  }

  for (const key of NOTE_MODEL_ENV) {
    const value = values[key]
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  return () => {
    for (const [key, value] of original) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

const GENERATED_NOTE = `# Clinical Note

## Chief Complaint
Foot pain

## History of Present Illness
One week of left foot pain, worse with walking.`

test("createClinicalNoteText routes through the note model wrapper for a configured provider", async () => {
  const restoreEnv = withOpenAICompatibleEnv()
  const originalFetch = globalThis.fetch
  const captured: { url?: string; body?: string; calls: number } = { calls: 0 }

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    captured.calls += 1
    captured.url = url
    captured.body = String(init?.body)
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ choices: [{ message: { content: GENERATED_NOTE } }] }),
    } as Response
  }) as typeof fetch

  try {
    const result = await createClinicalNoteText({
      transcript: "My foot has been hurting for the last week.",
      patient_name: "Test Patient",
      visit_reason: "history_physical",
      apiKey: "injected-anthropic-key",
    })

    assert.equal(captured.calls, 1, "The wrapper must issue exactly one provider request")
    assert.equal(captured.url, "https://llm.example.org/v1/chat/completions")

    const body = JSON.parse(String(captured.body))
    assert.equal(body.model, "qwen2.5-72b-instruct", "NOTE_MODEL_NAME must override the prompt default model")
    assert.equal(body.messages.length, 2)
    assert.ok(
      body.messages[1].content.includes("My foot has been hurting for the last week."),
      "The unchanged prompt template must still carry the transcript",
    )

    // Output behavior is unchanged: same markdown sections, same normalization.
    const sections = parseMarkdownNote(result)
    assert.equal(sections["Chief Complaint"], "Foot pain")
    assert.ok(sections["History of Present Illness"]?.includes("One week"))
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv()
  }
})

test("createClinicalNoteText strips code fences from a configured provider response", async () => {
  const restoreEnv = withOpenAICompatibleEnv()
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () =>
    ({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ choices: [{ message: { content: "```markdown\n" + GENERATED_NOTE + "\n```" } }] }),
    }) as Response) as typeof fetch

  try {
    const result = await createClinicalNoteText({
      transcript: "My foot has been hurting for the last week.",
      patient_name: "Test Patient",
      visit_reason: "history_physical",
    })

    assert.ok(!result.includes("```"), "Markdown fences must still be stripped")
    assert.equal(parseMarkdownNote(result)["Chief Complaint"], "Foot pain")
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv()
  }
})

test("createClinicalNoteText keeps its error surface for provider failures", async () => {
  const restoreEnv = withOpenAICompatibleEnv()
  const originalFetch = globalThis.fetch

  globalThis.fetch = (async () =>
    ({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ error: { code: "invalid_api_key" } }),
    }) as Response) as typeof fetch

  try {
    await createClinicalNoteText({
      transcript: "Test transcript",
      patient_name: "Test",
      visit_reason: "test",
    })
    assert.fail("Expected note generation to throw")
  } catch (error) {
    assert.equal((error as { code?: string }).code, "note_generation_error")
    assert.equal((error as { recoverable?: boolean }).recoverable, true)
    assert.equal(typeof (error as { message?: string }).message, "string")
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv()
  }
})

test("createClinicalNoteText fails clearly when required provider env is missing", async () => {
  const restoreEnv = withOpenAICompatibleEnv({ NOTE_MODEL_NAME: undefined })
  const originalFetch = globalThis.fetch
  let fetchCalls = 0

  globalThis.fetch = (async () => {
    fetchCalls += 1
    throw new Error("fetch should not be called")
  }) as typeof fetch

  try {
    await createClinicalNoteText({
      transcript: "Test transcript",
      patient_name: "Test",
      visit_reason: "test",
    })
    assert.fail("Expected note generation to throw")
  } catch (error) {
    assert.equal((error as { code?: string }).code, "note_generation_error")
    const details = (error as { details?: Record<string, unknown> }).details
    assert.ok(details, "Pipeline error details should be present")
    assert.equal(fetchCalls, 0, "No request may be attempted with an incomplete provider config")
  } finally {
    globalThis.fetch = originalFetch
    restoreEnv()
  }
})
