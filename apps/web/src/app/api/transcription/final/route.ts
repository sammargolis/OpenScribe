import type { NextRequest } from "next/server"
import { toPipelineError } from "@pipeline-errors"
import { isLikelySilentPcm16, parseWavHeader, resolveTranscriptionProvider } from "@transcription"
import { transcriptionSessionStore } from "@transcript-assembly"
import { writeAuditEntry } from "@storage/audit-log"
import {
  InvalidTranscriptionLanguageError,
  forgetSessionTranscriptionLanguage,
  resolveRequestTranscriptionLanguage,
  transcribeWithLanguage,
} from "@/lib/transcription-language"

export const runtime = "nodejs"

function jsonError(status: number, code: string, message: string, recoverable: boolean) {
  return new Response(JSON.stringify({ error: { code, message, recoverable } }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function isBlankTranscript(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  return (
    normalized.length === 0 ||
    normalized === "[blank_audio]" ||
    normalized === "no speech detected in audio" ||
    normalized === "audio file too small or empty" ||
    normalized === "none"
  )
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const sessionId = formData.get("session_id")
    const file = formData.get("file")

    if (typeof sessionId !== "string" || !(file instanceof Blob)) {
      return jsonError(400, "validation_error", "Missing session_id or file", false)
    }

    let languageOverride: string | undefined
    try {
      languageOverride = resolveRequestTranscriptionLanguage(sessionId, formData.get("language"))
    } catch (error) {
      if (error instanceof InvalidTranscriptionLanguageError) {
        return jsonError(400, "validation_error", error.message, false)
      }
      throw error
    }

    transcriptionSessionStore.setStatus(sessionId, "finalizing")

    const arrayBuffer = await file.arrayBuffer()
    let wavInfo
    try {
      wavInfo = parseWavHeader(arrayBuffer)
    } catch (error) {
      return jsonError(400, "validation_error", error instanceof Error ? error.message : "Invalid WAV file", true)
    }

    if (wavInfo.sampleRate !== 16000 || wavInfo.numChannels !== 1 || wavInfo.bitDepth !== 16) {
      return jsonError(400, "validation_error", "Final recording must be 16kHz mono 16-bit PCM WAV", true)
    }
    // Do not fail final transcription based on amplitude alone.
    // Quiet speech can still produce a valid transcript.
    const likelySilentAudio = isLikelySilentPcm16(arrayBuffer)

    // Resolved once, outside the try, so the catch below can report which
    // provider failed without re-invoking a resolver that may itself be what
    // threw — that turned a real transcription error into a generic 500.
    let resolvedProvider
    try {
      resolvedProvider = resolveTranscriptionProvider()
    } catch (error) {
      const pipelineError = toPipelineError(error, {
        code: "config_error",
        message: "No transcription provider is configured",
        recoverable: false,
      })
      transcriptionSessionStore.emitError(sessionId, pipelineError)
      return jsonError(500, pipelineError.code, pipelineError.message, pipelineError.recoverable)
    }

    try {
      const startedAtMs = Date.now()
      const transcript = await transcribeWithLanguage(
        Buffer.from(arrayBuffer),
        `${sessionId}-final.wav`,
        resolvedProvider,
        languageOverride,
      )
      const latencyMs = Date.now() - startedAtMs
      if (isBlankTranscript(transcript)) {
        transcriptionSessionStore.emitError(
          sessionId,
          "blank_audio",
          "No detectable speech signal in the recording. Check microphone input/device and retry.",
        )
        return jsonError(
          422,
          "blank_audio",
          "No detectable speech signal in the recording. Check microphone input/device and retry.",
        )
      }
      if (likelySilentAudio) {
        console.warn("[transcription.final] low-energy capture produced transcript", {
          sessionId,
          durationMs: wavInfo.durationMs,
        })
      }
      transcriptionSessionStore.setFinalTranscript(sessionId, transcript)
      forgetSessionTranscriptionLanguage(sessionId)

      // Audit log: final transcription completed
      await writeAuditEntry({
        event_type: "transcription.completed",
        resource_id: sessionId,
        success: true,
        metadata: {
          duration_ms: wavInfo.durationMs,
          file_size_bytes: arrayBuffer.byteLength,
          transcription_provider: resolvedProvider.provider,
          transcription_model: resolvedProvider.model,
          transcription_latency_ms: latencyMs,
          transcription_language: languageOverride || "auto",
        },
      })

      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      })
    } catch (error) {
      console.error("Final audio processing failed", error)
      const pipelineError = toPipelineError(error, {
        code: "api_error",
        message: "Transcription API failure",
        recoverable: true,
      })
      transcriptionSessionStore.emitError(sessionId, pipelineError)

      // Audit log: final transcription failed
      await writeAuditEntry({
        event_type: "transcription.failed",
        resource_id: sessionId,
        success: false,
        error_message: error instanceof Error ? error.message : "Transcription API failed",
        metadata: {
          transcription_provider: resolvedProvider.provider,
          transcription_model: resolvedProvider.model,
        },
      })

      return jsonError(502, pipelineError.code, pipelineError.message, pipelineError.recoverable)
    }
  } catch (error) {
    console.error("Final recording ingestion failed", error)
    return jsonError(500, "storage_error", "Failed to process final recording", false)
  }
}
