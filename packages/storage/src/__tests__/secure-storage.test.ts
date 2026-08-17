/**
 * Tests for HIPAA-compliant encryption implementation
 *
 * These tests run against the real Web Crypto implementation that ships with
 * Node (globalThis.crypto), so AES-GCM encryption, decryption and key import are
 * genuinely exercised rather than mocked. Only window.localStorage is stubbed,
 * because secure-storage.ts is browser-targeted and short-circuits when `window`
 * is undefined.
 */

import assert from "node:assert/strict"
import { webcrypto } from "node:crypto"
import { after, beforeEach, describe, it } from "node:test"
import {
  loadSecureItem,
  resetSecureStorageKeyCacheForTests,
  rotateEncryptionKey,
  saveSecureItem,
} from "../secure-storage.js"

const ENV_KEY_NAME = "NEXT_PUBLIC_SECURE_STORAGE_KEY"
const ORIGINAL_ENV_KEY = process.env[ENV_KEY_NAME]

// A deterministic, valid 256-bit key
const VALID_KEY_BASE64 = Buffer.from(new Uint8Array(32).fill(7)).toString("base64")

// Mock window.localStorage
const mockLocalStorage: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => mockLocalStorage[key] ?? null,
  setItem: (key: string, value: string) => {
    mockLocalStorage[key] = value
  },
  removeItem: (key: string) => {
    delete mockLocalStorage[key]
  },
  clear: () => {
    Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key])
  },
  get length() {
    return Object.keys(mockLocalStorage).length
  },
  key: (index: number) => Object.keys(mockLocalStorage)[index] ?? null,
} as Storage

Object.defineProperty(globalThis, "window", {
  value: { localStorage: localStorageMock },
  configurable: true,
  writable: true,
})

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageMock,
  configurable: true,
  writable: true,
})

/**
 * Build a genuine v1 payload (`enc.v1.<iv>.<ciphertext>`) with real AES-GCM so
 * the v1 -> v2 migration path is tested for real instead of via a stubbed
 * decrypt call.
 */
async function encryptAsV1(keyBase64: string, value: unknown): Promise<string> {
  const keyBytes = new Uint8Array(Buffer.from(keyBase64, "base64"))
  const key = await webcrypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, [
    "encrypt",
  ])
  const iv = webcrypto.getRandomValues(new Uint8Array(12))
  const data = new TextEncoder().encode(JSON.stringify(value))
  const ciphertext = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data)
  const ivBase64 = Buffer.from(iv).toString("base64")
  const dataBase64 = Buffer.from(new Uint8Array(ciphertext)).toString("base64")
  return `enc.v1.${ivBase64}.${dataBase64}`
}

beforeEach(() => {
  localStorageMock.clear()
  // Each test decides whether an env key exists, and the derived key is memoized
  // for the lifetime of the module, so drop the cache between tests.
  delete process.env[ENV_KEY_NAME]
  resetSecureStorageKeyCacheForTests()
})

after(() => {
  if (ORIGINAL_ENV_KEY === undefined) {
    delete process.env[ENV_KEY_NAME]
  } else {
    process.env[ENV_KEY_NAME] = ORIGINAL_ENV_KEY
  }
  resetSecureStorageKeyCacheForTests()
})

describe("Secure Storage - Encryption Tests", () => {
  it("should always produce encrypted payloads with version prefix", async () => {
    process.env[ENV_KEY_NAME] = VALID_KEY_BASE64

    const testData = { patient_name: "John Doe", visit_reason: "Annual checkup" }
    await saveSecureItem("test-encounter", testData)

    const stored = mockLocalStorage["test-encounter"]
    assert.ok(stored, "payload should be persisted")

    // Verify format: enc.v2.<iv>.<ciphertext>
    assert.match(stored, /^enc\.v2\.[^.]+\.[^.]+$/)
    assert.equal(stored.startsWith("enc.v2."), true)

    // The plaintext must not be recoverable from the stored payload
    assert.equal(stored.includes("John Doe"), false)

    // And real AES-GCM must round-trip it
    assert.deepStrictEqual(await loadSecureItem<typeof testData>("test-encounter"), testData)
  })

  it("should generate and persist a browser key when env key is missing", async () => {
    // No NEXT_PUBLIC_SECURE_STORAGE_KEY configured (cleared in beforeEach)
    const testData = { test: "data" }

    await saveSecureItem("test", testData)

    const generatedKey = mockLocalStorage.openscribe_encryption_key_web
    assert.ok(generatedKey, "a browser fallback key should be persisted")
    assert.equal(Buffer.from(generatedKey, "base64").byteLength, 32)
    assert.equal(mockLocalStorage.test.startsWith("enc.v2."), true)
    assert.deepStrictEqual(await loadSecureItem<typeof testData>("test"), testData)
  })

  it("should fail when encryption key is invalid length", async () => {
    // Set invalid key (16 bytes instead of 32)
    process.env[ENV_KEY_NAME] = Buffer.from(new Uint8Array(16)).toString("base64")

    await assert.rejects(
      () => saveSecureItem("test", { test: "data" }),
      /256-bit key/,
      "a short key must be rejected instead of silently weakening encryption"
    )
    assert.equal(mockLocalStorage.test, undefined)
  })

  it("should auto-migrate unencrypted legacy data to v2 format", async () => {
    process.env[ENV_KEY_NAME] = VALID_KEY_BASE64

    // Store unencrypted JSON (legacy format)
    const legacyData = { patient_name: "Jane Doe" }
    mockLocalStorage["legacy-encounter"] = JSON.stringify(legacyData)

    // Load should succeed and auto-migrate
    const loaded = await loadSecureItem<typeof legacyData>("legacy-encounter")
    assert.deepStrictEqual(loaded, legacyData)

    // Check that it was re-encrypted
    const stored = mockLocalStorage["legacy-encounter"]
    assert.equal(stored.startsWith("enc.v2."), true)
    assert.equal(stored.includes("Jane Doe"), false)

    // The migrated payload must still be readable
    assert.deepStrictEqual(await loadSecureItem<typeof legacyData>("legacy-encounter"), legacyData)
  })

  it("should auto-migrate v1 encrypted data to v2 format", async () => {
    process.env[ENV_KEY_NAME] = VALID_KEY_BASE64

    // A real v1 payload, encrypted with the same device key
    const v1Data = { patient_name: "Test" }
    mockLocalStorage["v1-encounter"] = await encryptAsV1(VALID_KEY_BASE64, v1Data)

    const loaded = await loadSecureItem<typeof v1Data>("v1-encounter")
    assert.deepStrictEqual(loaded, v1Data)

    // Check that it was re-encrypted with v2
    const stored = mockLocalStorage["v1-encounter"]
    assert.equal(stored.startsWith("enc.v2."), true)
    assert.deepStrictEqual(await loadSecureItem<typeof v1Data>("v1-encounter"), v1Data)
  })

  it("should discard payloads that cannot be decrypted with the current key", async () => {
    process.env[ENV_KEY_NAME] = VALID_KEY_BASE64

    // v1 payload encrypted under a different device key
    const otherKey = Buffer.from(new Uint8Array(32).fill(9)).toString("base64")
    mockLocalStorage["foreign-encounter"] = await encryptAsV1(otherKey, { patient_name: "Test" })

    await assert.rejects(
      () => loadSecureItem("foreign-encounter"),
      "AES-GCM authentication must fail for a payload from another key"
    )
  })
})

describe("Secure Storage - PHI Protection Tests", () => {
  it("should never serialize audio_blob in encounters", async () => {
    process.env[ENV_KEY_NAME] = VALID_KEY_BASE64

    // This test ensures the storage layer would encrypt the data structure.
    // The actual audio blob stripping happens in encounters.ts; here we verify
    // that a Blob reaching saveSecureItem neither throws nor persists audio bytes
    // (JSON.stringify turns a Blob into an empty object).
    const encounterWithAudio = {
      id: "test-123",
      patient_name: "John Doe",
      transcript: "Patient presents with...",
      audio_blob: new Blob(["fake audio data"], { type: "audio/wav" }),
    }

    await saveSecureItem("test-encounter", encounterWithAudio)

    const loaded = await loadSecureItem<Record<string, unknown>>("test-encounter")
    assert.deepStrictEqual(loaded?.audio_blob, {})
  })

  it("should handle empty or null values gracefully", async () => {
    process.env[ENV_KEY_NAME] = VALID_KEY_BASE64

    await saveSecureItem("empty-test", null)
    const loaded = await loadSecureItem("empty-test")

    // Should store and retrieve null
    assert.equal(loaded, null)
    assert.equal(mockLocalStorage["empty-test"].startsWith("enc.v2."), true)
  })
})

describe("Secure Storage - Key Rotation", () => {
  it("should provide a key rotation function", () => {
    assert.equal(typeof rotateEncryptionKey, "function")
  })

  it("should fail key rotation in non-Electron environment", async () => {
    // No desktop API available
    await assert.rejects(() => rotateEncryptionKey(), /requires Electron environment/)
  })
})
