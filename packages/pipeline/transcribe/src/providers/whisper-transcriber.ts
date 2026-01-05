const WHISPER_URL = "https://api.openai.com/v1/audio/transcriptions"

export async function transcribeWavBuffer(buffer: Buffer, filename: string, apiKey?: string): Promise<string> {
  const key = apiKey || process.env.OPENAI_API_KEY
  if (!key) {
    throw new Error("Missing OPENAI_API_KEY. Please configure your API key in Settings.")
  }
  const formData = new FormData()
  const blob = new Blob([new Uint8Array(buffer)], { type: "audio/wav" })
  formData.append("file", blob, filename)
  formData.append("model", "whisper-1")

  const response = await fetch(WHISPER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
    },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Transcription failed: ${response.status} ${errorText}`)
  }

  const result = (await response.json()) as { text?: string }
  return result.text?.trim() ?? ""
}
