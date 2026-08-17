import assert from "node:assert/strict"
import test from "node:test"
import { generateNoteCompletion, resolveNoteModelConfig } from "../index.js"

/**
 * Note model wrapper tests
 *
 * generateNoteCompletion() is the only note-generation entry point. These
 * tests exercise it without network access: the OpenAI-compatible transport is
 * driven through a stubbed global fetch, and the default Anthropic transport is
 * verified through its missing-key error (no request is ever issued).
 */

interface CapturedRequest {
  url?: string
  init?: RequestInit
  calls: number
}

function stubFetch(response: Partial<Response> & { json?: () => Promise<unknown> }): {
  captured: CapturedRequest
  restore: () => void
} {
  const originalFetch = globalThis.fetch
  const captured: CapturedRequest = { calls: 0 }

  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    captured.calls += 1
    captured.url = url
    captured.init = init
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      ...response,
    } as Response
  }) as typeof fetch

  return {
    captured,
    restore: () => {
      globalThis.fetch = originalFetch
    },
  }
}

const OPENAI_COMPATIBLE_CONFIG = resolveNoteModelConfig({
  NOTE_MODEL_PROVIDER: "vllm",
  NOTE_MODEL_BASE_URL: "https://llm.example.org/v1",
  NOTE_MODEL_NAME: "qwen2.5-72b-instruct",
  NOTE_MODEL_API_KEY: "provider-key",
})

test("generateNoteCompletion posts to an OpenAI-compatible chat completions endpoint", async () => {
  const { captured, restore } = stubFetch({
    json: async () => ({ choices: [{ message: { content: "## Chief Complaint\nFoot pain" } }] }),
  })

  try {
    const result = await generateNoteCompletion({
      system: "system prompt",
      prompt: "user prompt",
      model: "claude-sonnet-4-5-20250929",
      apiKey: "injected-anthropic-key",
      config: OPENAI_COMPATIBLE_CONFIG,
    })

    assert.equal(result.text, "## Chief Complaint\nFoot pain")
    assert.equal(result.provider, "vllm")
    assert.equal(result.model, "qwen2.5-72b-instruct", "NOTE_MODEL_NAME wins over the caller's model")
    assert.equal(captured.calls, 1)
    assert.equal(captured.url, "https://llm.example.org/v1/chat/completions")

    const headers = captured.init?.headers as Record<string, string>
    assert.equal(headers["Content-Type"], "application/json")
    assert.equal(
      headers.Authorization,
      "Bearer provider-key",
      "Third-party endpoints must receive NOTE_MODEL_API_KEY, never the injected Anthropic key",
    )

    const body = JSON.parse(String(captured.init?.body))
    assert.equal(body.model, "qwen2.5-72b-instruct")
    assert.equal(body.stream, false)
    assert.equal(body.max_tokens, 4096)
    assert.equal(body.messages[0].role, "system")
    assert.equal(body.messages[0].content, "system prompt")
    assert.equal(body.messages[1].role, "user")
    assert.equal(body.messages[1].content, "user prompt")
  } finally {
    restore()
  }
})

test("generateNoteCompletion normalizes array content parts", async () => {
  const { restore } = stubFetch({
    json: async () => ({
      choices: [{ message: { content: [{ type: "text", text: "first " }, { type: "text", text: "second" }] } }],
    }),
  })

  try {
    const result = await generateNoteCompletion({
      system: "system prompt",
      prompt: "user prompt",
      config: OPENAI_COMPATIBLE_CONFIG,
    })

    assert.equal(result.text, "first second")
  } finally {
    restore()
  }
})

test("generateNoteCompletion throws when the provider returns no content", async () => {
  const { restore } = stubFetch({ json: async () => ({ choices: [] }) })

  try {
    await assert.rejects(
      () =>
        generateNoteCompletion({
          system: "system prompt",
          prompt: "user prompt",
          config: OPENAI_COMPATIBLE_CONFIG,
        }),
      /No text content in note model response/,
    )
  } finally {
    restore()
  }
})

test("generateNoteCompletion error messages never echo the response body (PHI safety)", async () => {
  const phi = "Patient John Doe reports chest pain"
  const { restore } = stubFetch({
    ok: false,
    status: 400,
    statusText: "Bad Request",
    json: async () => ({ error: { code: "context_length_exceeded", message: phi } }),
  })

  try {
    await generateNoteCompletion({
      system: "system prompt",
      prompt: phi,
      config: OPENAI_COMPATIBLE_CONFIG,
    })
    assert.fail("Expected the request to fail")
  } catch (error) {
    const message = (error as Error).message
    assert.match(message, /Note model request failed: 400 Bad Request \(context_length_exceeded\)/)
    assert.ok(!message.includes("John Doe"), "Error message must not contain PHI from the response body")
    assert.ok(!message.includes(phi), "Error message must not contain the echoed prompt")
  } finally {
    restore()
  }
})

test("generateNoteCompletion uses the Anthropic transport by default", async () => {
  const { captured, restore } = stubFetch({ json: async () => ({ choices: [] }) })
  const originalKey = process.env.ANTHROPIC_API_KEY
  delete process.env.ANTHROPIC_API_KEY

  try {
    await assert.rejects(
      () =>
        generateNoteCompletion({
          system: "system prompt",
          prompt: "user prompt",
          config: resolveNoteModelConfig({}),
        }),
      /ANTHROPIC_API_KEY.*required/i,
      "Default path must keep the existing missing-key error",
    )
    assert.equal(captured.calls, 0, "No OpenAI-compatible request should be attempted on the default path")
  } finally {
    restore()
    if (originalKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = originalKey
    }
  }
})

test("generateNoteCompletion resolves config from process.env when none is passed", async () => {
  const { captured, restore } = stubFetch({
    json: async () => ({ choices: [{ message: { content: "note" } }] }),
  })
  const original = {
    provider: process.env.NOTE_MODEL_PROVIDER,
    baseUrl: process.env.NOTE_MODEL_BASE_URL,
    name: process.env.NOTE_MODEL_NAME,
    apiKey: process.env.NOTE_MODEL_API_KEY,
  }

  process.env.NOTE_MODEL_PROVIDER = "vllm"
  process.env.NOTE_MODEL_BASE_URL = "https://llm.example.org/v1"
  process.env.NOTE_MODEL_NAME = "qwen2.5-72b-instruct"
  process.env.NOTE_MODEL_API_KEY = "provider-key"

  try {
    const result = await generateNoteCompletion({
      system: "system prompt",
      prompt: "user prompt",
      model: "claude-sonnet-4-5-20250929",
    })

    assert.equal(result.text, "note")
    assert.equal(result.provider, "vllm")
    assert.equal(captured.url, "https://llm.example.org/v1/chat/completions")
  } finally {
    restore()
    for (const [key, value] of [
      ["NOTE_MODEL_PROVIDER", original.provider],
      ["NOTE_MODEL_BASE_URL", original.baseUrl],
      ["NOTE_MODEL_NAME", original.name],
      ["NOTE_MODEL_API_KEY", original.apiKey],
    ] as const) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
})

test("generateNoteCompletion surfaces the config error when required env is missing", async () => {
  const original = process.env.NOTE_MODEL_PROVIDER
  process.env.NOTE_MODEL_PROVIDER = "openai"

  try {
    await assert.rejects(
      () => generateNoteCompletion({ system: "system prompt", prompt: "user prompt" }),
      /NOTE_MODEL_NAME is required/,
    )
  } finally {
    if (original === undefined) {
      delete process.env.NOTE_MODEL_PROVIDER
    } else {
      process.env.NOTE_MODEL_PROVIDER = original
    }
  }
})

test("generateNoteCompletion rejects a plaintext custom endpoint even when config is passed directly", async () => {
  const { captured, restore } = stubFetch({ json: async () => ({ choices: [] }) })

  try {
    await assert.rejects(
      () =>
        generateNoteCompletion({
          system: "system prompt",
          prompt: "user prompt",
          config: {
            provider: "vllm",
            transport: "openai-compatible",
            baseUrl: "http://llm.example.org/v1",
            model: "some-model",
            apiKey: "provider-key",
          },
        }),
      /SECURITY ERROR.*must use HTTPS/,
      "HTTPS enforcement must not depend on config resolution alone",
    )
    assert.equal(captured.calls, 0, "No PHI may be sent to a plaintext endpoint")
  } finally {
    restore()
  }
})
