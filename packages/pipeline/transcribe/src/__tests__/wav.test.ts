import test from "node:test"
import assert from "node:assert/strict"
import { getWavDataChunk, isLikelySilentPcm16, parseWavHeader } from "../core/wav"

/**
 * Build a 16kHz mono 16-bit PCM WAV.
 *
 * `extraChunk` inserts an arbitrary chunk between "fmt " and "data" so the
 * RIFF word-alignment padding rule can be exercised.
 */
function buildWav(
  samples: number[],
  extraChunk?: { id: string; payload: number[] },
): ArrayBuffer {
  const dataBytes = samples.length * 2
  const extraBytes = extraChunk
    ? 8 + extraChunk.payload.length + (extraChunk.payload.length % 2)
    : 0
  const total = 12 + 24 + extraBytes + 8 + dataBytes
  const buffer = new ArrayBuffer(total)
  const view = new DataView(buffer)
  let offset = 0

  const writeAscii = (text: string) => {
    for (const char of text) view.setUint8(offset++, char.charCodeAt(0))
  }

  writeAscii("RIFF")
  view.setUint32(offset, total - 8, true)
  offset += 4
  writeAscii("WAVE")

  writeAscii("fmt ")
  view.setUint32(offset, 16, true)
  offset += 4
  view.setUint16(offset, 1, true) // PCM
  offset += 2
  view.setUint16(offset, 1, true) // mono
  offset += 2
  view.setUint32(offset, 16000, true) // sample rate
  offset += 4
  view.setUint32(offset, 32000, true) // byte rate
  offset += 4
  view.setUint16(offset, 2, true) // block align
  offset += 2
  view.setUint16(offset, 16, true) // bit depth
  offset += 2

  if (extraChunk) {
    writeAscii(extraChunk.id)
    view.setUint32(offset, extraChunk.payload.length, true)
    offset += 4
    for (const byte of extraChunk.payload) view.setUint8(offset++, byte)
    if (extraChunk.payload.length % 2 === 1) view.setUint8(offset++, 0) // pad byte
  }

  writeAscii("data")
  view.setUint32(offset, dataBytes, true)
  offset += 4
  for (const sample of samples) {
    view.setInt16(offset, sample, true)
    offset += 2
  }

  return buffer
}

const silence = new Array(1600).fill(0)
const speech = Array.from({ length: 1600 }, (_, i) => Math.round(12000 * Math.sin(i / 4)))

test("parseWavHeader reads a minimal 16kHz mono 16-bit WAV", () => {
  const info = parseWavHeader(buildWav(silence))
  assert.equal(info.sampleRate, 16000)
  assert.equal(info.numChannels, 1)
  assert.equal(info.bitDepth, 16)
  assert.equal(info.dataBytes, 3200)
  assert.equal(info.durationMs, 100)
})

test("parseWavHeader handles an odd-sized chunk before data", () => {
  // Regression: RIFF pads odd-sized chunks to a word boundary, and the padding
  // byte is not counted in chunkSize. Skipping it landed the parser one byte
  // off, so "data" was never found and a valid WAV was rejected as
  // "Incomplete WAV data". LIST/INFO metadata chunks are commonly odd-sized.
  const info = parseWavHeader(buildWav(silence, { id: "LIST", payload: [1, 2, 3] }))
  assert.equal(info.sampleRate, 16000)
  assert.equal(info.dataBytes, 3200)
})

test("getWavDataChunk locates the payload and clamps to the real length", () => {
  const chunk = getWavDataChunk(buildWav(speech))
  assert.ok(chunk)
  assert.equal(chunk.size, 3200)

  const withMetadata = getWavDataChunk(buildWav(speech, { id: "LIST", payload: [9] }))
  assert.ok(withMetadata)
  assert.equal(withMetadata.size, 3200)
})

test("getWavDataChunk returns null for a buffer too small to be a WAV", () => {
  assert.equal(getWavDataChunk(new ArrayBuffer(8)), null)
})

test("isLikelySilentPcm16 detects digital silence", () => {
  assert.equal(isLikelySilentPcm16(buildWav(silence)), true)
})

test("isLikelySilentPcm16 does not flag real signal", () => {
  assert.equal(isLikelySilentPcm16(buildWav(speech)), false)
})

test("isLikelySilentPcm16 does not flag quiet speech", () => {
  // Quiet speech must still transcribe, so the heuristic has to stay well
  // below conversational levels.
  const quiet = Array.from({ length: 1600 }, (_, i) => Math.round(400 * Math.sin(i / 4)))
  assert.equal(isLikelySilentPcm16(buildWav(quiet)), false)
})

test("isLikelySilentPcm16 strides instead of scanning every sample", () => {
  // A 30-minute 16kHz recording is ~28.8M samples. Scanning all of them blocked
  // the server's event loop; striding keeps the cost flat while preserving the
  // verdict. This asserts both: it stays fast and still reports silence.
  const longSilence = new Array(16000 * 60).fill(0)
  const buffer = buildWav(longSilence)

  const startedAt = process.hrtime.bigint()
  const verdict = isLikelySilentPcm16(buffer)
  const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6

  assert.equal(verdict, true)
  assert.ok(elapsedMs < 50, `expected strided scan under 50ms, took ${elapsedMs.toFixed(1)}ms`)
})

test("isLikelySilentPcm16 honours a custom inspection budget", () => {
  const buffer = buildWav(speech)
  assert.equal(isLikelySilentPcm16(buffer, 10), false)
  assert.equal(isLikelySilentPcm16(buildWav(silence), 10), true)
})
