import { PipelineStageError } from "../../../shared/src/error"

export interface WavInfo {
  sampleRate: number
  numChannels: number
  bitDepth: number
  durationMs: number
  dataBytes: number
}

function readString(view: DataView, offset: number, length: number): string {
  let value = ""
  for (let i = 0; i < length; i++) {
    value += String.fromCharCode(view.getUint8(offset + i))
  }
  return value
}

export function parseWavHeader(buffer: ArrayBuffer): WavInfo {
  if (buffer.byteLength < 44) {
    throw new PipelineStageError("validation_error", "WAV buffer too small", true)
  }

  const view = new DataView(buffer)
  const riff = readString(view, 0, 4)
  const wave = readString(view, 8, 4)
  if (riff !== "RIFF" || wave !== "WAVE") {
    throw new PipelineStageError("validation_error", "Invalid WAV header", true)
  }

  let offset = 12
  let sampleRate = 0
  let numChannels = 0
  let bitDepth = 0
  let dataBytes = 0

  while (offset + 8 <= buffer.byteLength) {
    const chunkId = readString(view, offset, 4)
    const chunkSize = view.getUint32(offset + 4, true)
    const chunkStart = offset + 8

    if (chunkId === "fmt ") {
      const audioFormat = view.getUint16(chunkStart, true)
      if (audioFormat !== 1) {
        throw new PipelineStageError("validation_error", "Only PCM WAV files are supported", true)
      }
      numChannels = view.getUint16(chunkStart + 2, true)
      sampleRate = view.getUint32(chunkStart + 4, true)
      bitDepth = view.getUint16(chunkStart + 14, true)
    } else if (chunkId === "data") {
      dataBytes = chunkSize
      break
    }

    // RIFF chunks are word-aligned: an odd-sized chunk is followed by a pad
    // byte that is not counted in chunkSize. Without this, a WAV carrying an
    // odd-length metadata chunk (LIST/INFO is common) lands one byte off and
    // the "data" chunk is never found.
    offset = chunkStart + chunkSize + (chunkSize % 2)
  }

  if (!sampleRate || !numChannels || !bitDepth || !dataBytes) {
    throw new PipelineStageError("validation_error", "Incomplete WAV data", true)
  }

  const bytesPerSample = bitDepth / 8
  const totalSamples = dataBytes / bytesPerSample / numChannels
  const durationMs = (totalSamples / sampleRate) * 1000

  return {
    sampleRate,
    numChannels,
    bitDepth,
    durationMs,
    dataBytes,
  }
}

/** Locate the PCM payload inside a WAV buffer, clamped to the real byte length. */
export function getWavDataChunk(buffer: ArrayBuffer): { offset: number; size: number } | null {
  if (buffer.byteLength < 44) return null
  const view = new DataView(buffer)
  let offset = 12
  while (offset + 8 <= buffer.byteLength) {
    const chunkId = readString(view, offset, 4)
    const chunkSize = view.getUint32(offset + 4, true)
    const chunkStart = offset + 8
    if (chunkId === "data") {
      return { offset: chunkStart, size: Math.min(chunkSize, buffer.byteLength - chunkStart) }
    }
    offset = chunkStart + chunkSize + (chunkSize % 2)
  }
  return null
}

/**
 * Cheap energy heuristic for "this capture contains no real signal".
 *
 * Only ever an advisory signal — quiet speech still transcribes, so callers
 * must not reject audio on this alone.
 *
 * Strided rather than exhaustive: a 30-minute 16kHz mono recording is ~28.8M
 * samples, and scanning every one blocked the Next server's event loop (and
 * therefore the SSE progress stream) for the duration. RMS and peak over a
 * few thousand evenly spaced samples answer "is this silence?" just as well.
 */
export function isLikelySilentPcm16(buffer: ArrayBuffer, maxSamplesToInspect = 20000): boolean {
  const data = getWavDataChunk(buffer)
  if (!data || data.size < 2) return true

  const view = new DataView(buffer, data.offset, data.size)
  const sampleCount = Math.floor(data.size / 2)
  if (sampleCount === 0) return true

  const stride = Math.max(1, Math.ceil(sampleCount / maxSamplesToInspect))

  let sumSquares = 0
  let peak = 0
  let nonTrivial = 0
  let inspected = 0
  for (let i = 0; i < sampleCount; i += stride) {
    const normalized = view.getInt16(i * 2, true) / 32768
    const abs = Math.abs(normalized)
    if (abs > peak) peak = abs
    if (abs > 0.001) nonTrivial += 1
    sumSquares += normalized * normalized
    inspected += 1
  }

  const rms = Math.sqrt(sumSquares / inspected)
  const nonTrivialRatio = nonTrivial / inspected
  return rms < 0.001 && peak < 0.005 && nonTrivialRatio < 0.02
}
