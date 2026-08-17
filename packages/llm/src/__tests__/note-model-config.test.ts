import assert from "node:assert/strict"
import test from "node:test"
import {
  DEFAULT_NOTE_MODEL_PROVIDER,
  NOTE_MODEL_ENV_KEYS,
  assertSecureEndpoint,
  isLoopbackHostname,
  resolveNoteModelConfig,
} from "../index.js"

/**
 * Note model configuration tests
 *
 * Covers the env -> config resolution used by note generation:
 * defaults must reproduce the historical Anthropic path, non-default providers
 * must fail loudly when required values are missing, and no configuration may
 * ever send PHI over plaintext HTTP.
 */

test("resolveNoteModelConfig defaults to the Anthropic path when no env is set", () => {
  const config = resolveNoteModelConfig({})

  assert.equal(config.provider, DEFAULT_NOTE_MODEL_PROVIDER)
  assert.equal(config.provider, "anthropic")
  assert.equal(config.transport, "anthropic")
  assert.equal(config.model, undefined, "Model must fall through to the prompt default")
  assert.equal(config.baseUrl, undefined)
  assert.equal(config.apiKey, undefined)
})

test("resolveNoteModelConfig treats blank env values as unset", () => {
  const config = resolveNoteModelConfig({
    NOTE_MODEL_PROVIDER: "   ",
    NOTE_MODEL_NAME: "",
    NOTE_MODEL_BASE_URL: "",
    NOTE_MODEL_API_KEY: "  ",
  })

  assert.equal(config.transport, "anthropic")
  assert.equal(config.model, undefined)
})

test("resolveNoteModelConfig keeps the default provider optional-everything", () => {
  const config = resolveNoteModelConfig({
    NOTE_MODEL_PROVIDER: "anthropic",
    NOTE_MODEL_NAME: "claude-haiku-4-5",
  })

  assert.equal(config.transport, "anthropic")
  assert.equal(config.model, "claude-haiku-4-5")
  assert.equal(config.apiKey, undefined, "Anthropic path still relies on the injected key")
})

test("resolveNoteModelConfig switches to the OpenAI-compatible transport", () => {
  const config = resolveNoteModelConfig({
    NOTE_MODEL_PROVIDER: "vllm",
    NOTE_MODEL_BASE_URL: "https://llm.example.org/v1",
    NOTE_MODEL_NAME: "qwen2.5-72b-instruct",
    NOTE_MODEL_API_KEY: "test-key",
  })

  assert.equal(config.transport, "openai-compatible")
  assert.equal(config.provider, "vllm")
  assert.equal(config.baseUrl, "https://llm.example.org/v1")
  assert.equal(config.model, "qwen2.5-72b-instruct")
  assert.equal(config.apiKey, "test-key")
})

test("resolveNoteModelConfig lowercases the provider id", () => {
  const config = resolveNoteModelConfig({
    NOTE_MODEL_PROVIDER: "OpenAI",
    NOTE_MODEL_NAME: "gpt-4.1-mini",
    NOTE_MODEL_API_KEY: "test-key",
  })

  assert.equal(config.provider, "openai")
  assert.equal(config.transport, "openai-compatible")
  assert.equal(config.baseUrl, "https://api.openai.com/v1", "Known provider supplies its endpoint")
})

test("resolveNoteModelConfig throws when NOTE_MODEL_NAME is missing", () => {
  assert.throws(
    () =>
      resolveNoteModelConfig({
        NOTE_MODEL_PROVIDER: "openai",
        NOTE_MODEL_API_KEY: "test-key",
      }),
    /NOTE_MODEL_NAME is required/,
  )
})

test("resolveNoteModelConfig throws when NOTE_MODEL_API_KEY is missing", () => {
  assert.throws(
    () =>
      resolveNoteModelConfig({
        NOTE_MODEL_PROVIDER: "openai",
        NOTE_MODEL_NAME: "gpt-4.1-mini",
      }),
    /NOTE_MODEL_API_KEY is required/,
  )
})

test("resolveNoteModelConfig throws when an unknown provider has no base URL", () => {
  assert.throws(
    () =>
      resolveNoteModelConfig({
        NOTE_MODEL_PROVIDER: "some-gateway",
        NOTE_MODEL_NAME: "some-model",
        NOTE_MODEL_API_KEY: "test-key",
      }),
    /NOTE_MODEL_BASE_URL is required/,
  )
})

test("resolveNoteModelConfig rejects plaintext HTTP base URLs for HIPAA compliance", () => {
  assert.throws(
    () =>
      resolveNoteModelConfig({
        NOTE_MODEL_PROVIDER: "vllm",
        NOTE_MODEL_BASE_URL: "http://llm.example.org/v1",
        NOTE_MODEL_NAME: "some-model",
        NOTE_MODEL_API_KEY: "test-key",
      }),
    /SECURITY ERROR.*must use HTTPS/,
  )
})

test("resolveNoteModelConfig rejects plaintext HTTP base URLs on the default provider too", () => {
  assert.throws(
    () =>
      resolveNoteModelConfig({
        NOTE_MODEL_BASE_URL: "http://proxy.example.org",
      }),
    /SECURITY ERROR.*must use HTTPS/,
  )
})

test("resolveNoteModelConfig allows plaintext loopback endpoints", () => {
  for (const baseUrl of [
    "http://localhost:11434/v1",
    "http://127.0.0.1:8080/v1",
    "http://[::1]:8080/v1",
    "http://ollama.localhost/v1",
  ]) {
    const config = resolveNoteModelConfig({
      NOTE_MODEL_PROVIDER: "ollama",
      NOTE_MODEL_BASE_URL: baseUrl,
      NOTE_MODEL_NAME: "local-model",
      NOTE_MODEL_API_KEY: "local",
    })

    assert.equal(config.baseUrl, baseUrl, `${baseUrl} should be accepted as loopback`)
  }
})

test("resolveNoteModelConfig rejects malformed base URLs", () => {
  assert.throws(
    () =>
      resolveNoteModelConfig({
        NOTE_MODEL_BASE_URL: "not-a-url",
      }),
    /Invalid NOTE_MODEL_BASE_URL URL/,
  )
})

test("resolveNoteModelConfig reads process.env by default", () => {
  const originalProvider = process.env.NOTE_MODEL_PROVIDER
  delete process.env.NOTE_MODEL_PROVIDER

  try {
    const config = resolveNoteModelConfig()
    assert.equal(config.transport, "anthropic")
  } finally {
    if (originalProvider !== undefined) {
      process.env.NOTE_MODEL_PROVIDER = originalProvider
    }
  }
})

test("NOTE_MODEL_ENV_KEYS documents the supported env variables", () => {
  assert.deepEqual(NOTE_MODEL_ENV_KEYS, {
    provider: "NOTE_MODEL_PROVIDER",
    baseUrl: "NOTE_MODEL_BASE_URL",
    apiKey: "NOTE_MODEL_API_KEY",
    model: "NOTE_MODEL_NAME",
  })
})

test("isLoopbackHostname only accepts local addresses", () => {
  assert.equal(isLoopbackHostname("localhost"), true)
  assert.equal(isLoopbackHostname("127.0.0.1"), true)
  assert.equal(isLoopbackHostname("127.1.2.3"), true)
  assert.equal(isLoopbackHostname("::1"), true)
  assert.equal(isLoopbackHostname("api.localhost"), true)
  assert.equal(isLoopbackHostname("example.com"), false)
  assert.equal(isLoopbackHostname("localhost.example.com"), false)
  assert.equal(isLoopbackHostname("10.0.0.5"), false)
})

test("assertSecureEndpoint labels the offending setting without leaking a body", () => {
  assert.throws(
    () => assertSecureEndpoint("http://example.com/v1", "NOTE_MODEL_BASE_URL"),
    /SECURITY ERROR: NOTE_MODEL_BASE_URL must use HTTPS for HIPAA compliance/,
  )
  assert.equal(assertSecureEndpoint("https://example.com/v1", "NOTE_MODEL_BASE_URL").protocol, "https:")
})
