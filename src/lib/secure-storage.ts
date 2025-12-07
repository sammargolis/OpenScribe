const ENCODER = new TextEncoder()
const DECODER = new TextDecoder()
const KEY_ENV = (process.env.NEXT_PUBLIC_SECURE_STORAGE_KEY ?? "").trim()
const PREFIX = ["enc", "v1"]

let keyPromise: Promise<CryptoKey> | null = null

function getCrypto(): Crypto {
  const cryptoRef = (typeof globalThis !== "undefined" ? (globalThis as unknown as { crypto?: Crypto }).crypto : undefined) ?? null
  if (!cryptoRef || !cryptoRef.subtle) {
    throw new Error("Web Crypto API is not available in this environment.")
  }
  return cryptoRef
}

function base64ToBytes(value: string): Uint8Array {
  if (typeof window === "undefined") {
    return new Uint8Array(Buffer.from(value, "base64"))
  }
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof window === "undefined") {
    return Buffer.from(bytes).toString("base64")
  }
  let binary = ""
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })
  return btoa(binary)
}

async function getKey(): Promise<CryptoKey> {
  if (!KEY_ENV) {
    throw new Error("NEXT_PUBLIC_SECURE_STORAGE_KEY must be configured.")
  }
  if (!keyPromise) {
    keyPromise = (async () => {
      const keyBytes = base64ToBytes(KEY_ENV)
      if (keyBytes.byteLength !== 32) {
        throw new Error("NEXT_PUBLIC_SECURE_STORAGE_KEY must be a base64 encoded 256-bit key.")
      }
      return getCrypto().subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"])
    })().catch((error) => {
      keyPromise = null
      throw error
    })
  }
  return keyPromise
}

function parsePayload(value: string) {
  const parts = value.split(".")
  if (parts.length !== 4) return null
  if (parts[0] !== PREFIX[0] || parts[1] !== PREFIX[1]) return null
  return { iv: base64ToBytes(parts[2]), data: base64ToBytes(parts[3]) }
}

function formatPayload(iv: Uint8Array, ciphertext: Uint8Array): string {
  return `${PREFIX[0]}.${PREFIX[1]}.${bytesToBase64(iv)}.${bytesToBase64(ciphertext)}`
}

export async function saveSecureItem<T>(key: string, value: T): Promise<void> {
  if (typeof window === "undefined") return
  const cryptoRef = getCrypto()
  const iv = cryptoRef.getRandomValues(new Uint8Array(12))
  const data = ENCODER.encode(JSON.stringify(value))
  const cryptoKey = await getKey()
  const encrypted = await cryptoRef.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, data)
  window.localStorage.setItem(key, formatPayload(iv, new Uint8Array(encrypted)))
}

export async function loadSecureItem<T>(key: string): Promise<T | null> {
  if (typeof window === "undefined") return null
  const stored = window.localStorage.getItem(key)
  if (!stored) return null
  const payload = parsePayload(stored)
  if (!payload) {
    try {
      const parsed = JSON.parse(stored) as T
      try {
        await saveSecureItem(key, parsed)
      } catch {
        // Ignore migration failures but still return the readable value
      }
      return parsed
    } catch {
      window.localStorage.removeItem(key)
      return null
    }
  }
  const cryptoKey = await getKey()
  const decrypted = await getCrypto().subtle.decrypt({ name: "AES-GCM", iv: payload.iv }, cryptoKey, payload.data)
  try {
    return JSON.parse(DECODER.decode(decrypted)) as T
  } catch {
    window.localStorage.removeItem(key)
    return null
  }
}
