import type { ProcessingMode } from "@storage/preferences"

/**
 * Pure, DOM-free resolution of which pipeline steps can run right now.
 *
 * OpenScribe is local-first but mixed mode still sends the transcript to
 * Anthropic for note generation. Losing connectivity is therefore harmless in
 * local mode and fatal in mixed mode, so the answer depends on the mode, the
 * network, the API key, and whether the local Whisper runtime is ready.
 */

export type CapabilityStepId = "transcription" | "note-generation"
export type CapabilityAvailability = "available" | "unavailable"
export type CapabilitySeverity = "ready" | "blocked"
export type CapabilityFix = "reconnect" | "switch-to-local" | "add-api-key" | "wait-for-runtime"

export interface CapabilityStep {
  id: CapabilityStepId
  label: string
  status: CapabilityAvailability
  /** Short user-facing word for the state. Never rely on color alone. */
  statusLabel: string
  detail: string
}

export interface CapabilityStatus {
  online: boolean
  processingMode: ProcessingMode
  severity: CapabilitySeverity
  headline: string
  message: string
  steps: CapabilityStep[]
  /** False when a recording started now cannot complete end to end. */
  canStartRecording: boolean
  blockedReason: string
  fix: CapabilityFix | null
}

export interface CapabilityStatusInput {
  online: boolean
  processingMode: ProcessingMode
  hasApiKey: boolean
  whisperReady: boolean
}

const TRANSCRIPTION_LABEL = "Transcription"
const NOTE_GENERATION_LABEL = "Note generation"

export function resolveCapabilityStatus({
  online,
  processingMode,
  hasApiKey,
  whisperReady,
}: CapabilityStatusInput): CapabilityStatus {
  const isLocalMode = processingMode === "local"

  const transcription: CapabilityStep = whisperReady
    ? {
        id: "transcription",
        label: TRANSCRIPTION_LABEL,
        status: "available",
        statusLabel: "Ready",
        detail: "Whisper runs on this machine, so it works without a network connection.",
      }
    : {
        id: "transcription",
        label: TRANSCRIPTION_LABEL,
        status: "unavailable",
        statusLabel: "Not ready",
        detail: "The local Whisper runtime is still starting up or needs setup.",
      }

  let noteGeneration: CapabilityStep
  if (isLocalMode) {
    noteGeneration = {
      id: "note-generation",
      label: NOTE_GENERATION_LABEL,
      status: "available",
      statusLabel: "Ready",
      detail: "Local-only mode generates notes on this machine. No network needed.",
    }
  } else if (!hasApiKey) {
    noteGeneration = {
      id: "note-generation",
      label: NOTE_GENERATION_LABEL,
      status: "unavailable",
      statusLabel: "Needs API key",
      detail: "Mixed mode uses Claude for note generation. Add your Anthropic key in Settings.",
    }
  } else if (!online) {
    noteGeneration = {
      id: "note-generation",
      label: NOTE_GENERATION_LABEL,
      status: "unavailable",
      statusLabel: "Offline",
      detail: "Mixed mode needs the internet to reach Claude. Reconnect, or switch to local-only mode.",
    }
  } else {
    noteGeneration = {
      id: "note-generation",
      label: NOTE_GENERATION_LABEL,
      status: "available",
      statusLabel: "Ready",
      detail: "Claude is reachable and an Anthropic key is configured.",
    }
  }

  const steps = [transcription, noteGeneration]
  const canStartRecording = steps.every((step) => step.status === "available")

  let headline: string
  let message: string
  let blockedReason = ""
  let fix: CapabilityFix | null = null

  if (canStartRecording) {
    if (!online) {
      headline = "Offline — local-only mode is ready"
      message = "Every step of this encounter runs on this machine, so nothing is blocked by being offline."
    } else {
      headline = "All steps ready"
      message = isLocalMode
        ? "Transcription and note generation both run on this machine."
        : "Whisper transcribes locally and Claude generates the note."
    }
  } else if (transcription.status === "unavailable") {
    headline = "Transcription is not ready"
    message = transcription.detail
    blockedReason = transcription.detail
    fix = "wait-for-runtime"
  } else if (!hasApiKey) {
    headline = "Note generation is unavailable"
    message = noteGeneration.detail
    blockedReason = "Mixed mode has no Anthropic API key, so note generation would fail after recording."
    fix = "add-api-key"
  } else {
    headline = "Offline — note generation will fail"
    message = noteGeneration.detail
    blockedReason =
      "You are offline and mixed mode sends the transcript to Claude, so note generation would fail after you finish recording."
    fix = "switch-to-local"
  }

  return {
    online,
    processingMode,
    severity: canStartRecording ? "ready" : "blocked",
    headline,
    message,
    steps,
    canStartRecording,
    blockedReason,
    fix,
  }
}
