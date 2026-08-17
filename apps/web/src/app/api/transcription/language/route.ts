import type { NextRequest } from "next/server"
import { InvalidTranscriptionLanguageError, rememberSessionTranscriptionLanguage } from "@/lib/transcription-language"

export const runtime = "nodejs"

function jsonError(status: number, code: string, message: string, recoverable: boolean) {
  return new Response(JSON.stringify({ error: { code, message, recoverable } }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

/**
 * Register the transcription language selected in the UI for a capture session.
 * Segment uploads are queued by a shared controller that does not carry the
 * preference, so the session-scoped value is what keeps interim segments and
 * the final transcript in the same language.
 */
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonError(400, "validation_error", "Expected a JSON body", false)
  }

  const payload = (body ?? {}) as { session_id?: unknown; language?: unknown }
  const sessionId = payload.session_id
  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    return jsonError(400, "validation_error", "Missing session_id", false)
  }

  try {
    const language = rememberSessionTranscriptionLanguage(sessionId, payload.language)
    return new Response(JSON.stringify({ ok: true, session_id: sessionId, language }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (error) {
    if (error instanceof InvalidTranscriptionLanguageError) {
      return jsonError(400, "validation_error", error.message, false)
    }
    console.error("Failed to register transcription language", error)
    return jsonError(500, "storage_error", "Failed to register transcription language", false)
  }
}
