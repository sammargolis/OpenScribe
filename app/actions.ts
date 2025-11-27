"use server"

import { generateText } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { SYSTEM_PROMPT, generateUserPrompt } from "@/app/utils/prompts"
import fs from "fs/promises"
import path from "path"

export async function transcribeAudio(audioBlob: Blob, apiKey: string | null): Promise<string> {
  try {
    // Check if we have a Whisper API URL configured (for Docker setup)
    const whisperUrl = process.env.WHISPER_API_URL
    
    if(!whisperUrl) {
      throw new Error("Whisper API URL is not configured")
    }

    const formData = new FormData()
    formData.append("file", audioBlob, "audio.webm")
    formData.append("model", "base")
    formData.append("response_format", "text")

    const response = await fetch(`${whisperUrl}/v1/audio/transcriptions`, {
      method: "POST",
      body: formData,
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error("Whisper API error:", errorText)
      throw new Error(`Whisper API failed: ${response.status} ${errorText}`)
    }

    // If response_format is 'text', it returns plain text
    // The Whisper API response format handling might differ slightly between implementations
    // fedirz/faster-whisper-server with response_format='text' returns plain text.
    // If it returns JSON despite 'text', we handle both.
    let text = ""
    const contentType = response.headers.get("content-type")
    if (contentType && contentType.includes("application/json")) {
      const data = await response.json()
      text = data.text
    } else {
      text = await response.text()
    }
    
    text = text.trim()

    // Save transcript to local file
    const transcriptsDir = path.join(process.cwd(), "transcripts")
    await fs.mkdir(transcriptsDir, { recursive: true })
    const filename = `transcript-${Date.now()}.txt`
    await fs.writeFile(path.join(transcriptsDir, filename), text, "utf-8")
    console.log(`Transcript saved to ${filename}`)

    return text

  } catch (error) {
    console.error("Transcription error:", error)
    throw new Error("Failed to transcribe audio")
  }
}

export async function generateClinicalNote(params: {
  transcript: string
  patient_name: string
  visit_reason: string
  apiKey: string | null
}): Promise<string> {
  const { transcript, patient_name, visit_reason, apiKey } = params

  const userPrompt = generateUserPrompt({
    patient_name,
    visit_reason,
    transcript,
  })

  try {
    if (apiKey) {
      const openai = createOpenAI({ apiKey })
      const { text } = await generateText({
        model: openai("gpt-4o"),
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
      })
      return text
    } else {
      // Fallback to AI Gateway (no API key needed)
      const { text } = await generateText({
        model: "openai/gpt-4o",
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
      })
      return text
    }
  } catch (error) {
    console.error("AI generation error:", error)
    throw new Error(`Failed to generate note: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}
