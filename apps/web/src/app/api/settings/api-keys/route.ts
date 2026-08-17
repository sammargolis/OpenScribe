import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "fs"
import path from "path"
import crypto from "crypto"
import { writeAuditEntry } from "@storage/audit-log"
import { getApiKeysConfigPath, getApiKeysEncryptionKeyPath } from "@storage/server-api-keys"

// Encryption configuration
const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 12
const KEY_LENGTH = 32

/**
 * Get or generate encryption key for API key file.
 * In Electron, we could use safeStorage, but Next.js API routes run in Node.js
 * so we store an encrypted key in a separate file.
 */
async function getEncryptionKey(): Promise<Buffer> {
  const keyPath = getApiKeysEncryptionKeyPath()
  const configDir = path.dirname(keyPath)

  try {
    // Try to read existing key
    const keyData = await fs.readFile(keyPath)
    if (keyData.length !== KEY_LENGTH) {
      throw new Error(
        `Encryption key at ${keyPath} is ${keyData.length} bytes, expected ${KEY_LENGTH}`,
      )
    }
    return keyData
  } catch (error) {
    // A wrong-length key means an existing, undecryptable key file. Regenerating
    // would silently orphan the stored keys, so surface it instead.
    if (error instanceof Error && error.message.includes("expected")) {
      throw error
    }

    // Generate new key
    const key = crypto.randomBytes(KEY_LENGTH)

    // Ensure directory exists
    try {
      await fs.mkdir(configDir, { recursive: true })
    } catch {
      // Directory may already exist or not be creatable yet.
    }

    // Store key with restrictive permissions
    await fs.writeFile(keyPath, key, { mode: 0o600 })
    return key
  }
}

/**
 * Encrypt API keys using AES-256-GCM
 */
async function encryptData(plaintext: string): Promise<string> {
  const key = await getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(plaintext, "utf8")
  encrypted = Buffer.concat([encrypted, cipher.final()])
  
  const authTag = cipher.getAuthTag()
  
  // Format: enc.v2.<iv>.<authTag>.<ciphertext> (all base64)
  return `enc.v2.${iv.toString("base64")}.${authTag.toString("base64")}.${encrypted.toString("base64")}`
}

// Decryption deliberately lives only in @storage/server-api-keys. This route
// writes; it never reads keys back out. See the note where GET used to be.

// Where to store config. Shared with the server-side reader so the write path
// and the read path can never diverge.
function getConfigPath(): string {
  return getApiKeysConfigPath()
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { openaiApiKey, anthropicApiKey } = body

    const configPath = getConfigPath()

    // Prepare data
    const data = JSON.stringify(
      {
        openaiApiKey: openaiApiKey || "",
        anthropicApiKey: anthropicApiKey || "",
      },
      null,
      2
    )
    
    // Encrypt before saving
    const encrypted = await encryptData(data)
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(configPath), { recursive: true })
    
    // Save encrypted data
    await fs.writeFile(configPath, encrypted, { mode: 0o600 })

    // Audit log: API keys configured
    await writeAuditEntry({
      event_type: "settings.api_key_configured",
      success: true,
      metadata: {
        has_openai_key: !!openaiApiKey,
        has_anthropic_key: !!anthropicApiKey,
      },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to save API keys:", error)

    // Audit log: API key configuration failed
    await writeAuditEntry({
      event_type: "settings.api_key_configured",
      success: false,
      error_message: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      { error: "Failed to save API keys" },
      { status: 500 }
    )
  }
}

/**
 * Deliberately no GET handler.
 *
 * This route used to expose a GET that decrypted api-keys.json and returned the
 * plaintext openaiApiKey/anthropicApiKey in its JSON body. Nothing in the app
 * ever called it — the client reads keys from its own encrypted local store via
 * @storage/api-keys, and server code reads the file directly through
 * @storage/server-api-keys. It was an unauthenticated read oracle on the
 * loopback Next server that handed out the user's provider credentials to any
 * local process, which defeats the point of encrypting them at rest.
 *
 * If a presence check is needed, use /api/settings/mixed-auth-status, which
 * returns only a boolean and the key's source.
 */
