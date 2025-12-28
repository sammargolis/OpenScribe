import { runLLMRequest, prompts } from "@llm"
import { 
  extractMarkdownFromResponse, 
  normalizeMarkdownSections,
  createEmptyMarkdownNote 
} from "./clinical-models/markdown-note"

export type NoteLength = "short" | "long"

export interface ClinicalNoteRequest {
  transcript: string
  patient_name: string
  visit_reason: string
  noteLength?: NoteLength
  template?: string
}

export async function createClinicalNoteText(params: ClinicalNoteRequest): Promise<string> {
  const { transcript, patient_name, visit_reason, noteLength = "long", template } = params

  console.log("=".repeat(80))
  console.log("GENERATING CLINICAL NOTE (MARKDOWN)")
  console.log("=".repeat(80))
  console.log(`Patient Name: ${patient_name || "Not provided"}`)
  console.log(`Visit Reason: ${visit_reason || "Not provided"}`)
  console.log(`Note Length: ${noteLength}`)
  console.log(`Template: ${template || "default"}`)
  console.log(`Transcript length: ${transcript.length} characters`)

  if (!transcript || transcript.trim().length === 0) {
    console.log("⚠️  Transcript is empty - returning empty note structure")
    const emptyNote = createEmptyMarkdownNote()
    console.log("=".repeat(80))
    console.log("FINAL CLINICAL NOTE (EMPTY):")
    console.log("-".repeat(80))
    console.log(emptyNote)
    console.log("-".repeat(80))
    console.log("=".repeat(80))
    return emptyNote
  }

  console.log("📝 Transcript being used for note generation:")
  console.log("-".repeat(80))
  console.log(transcript)
  console.log("-".repeat(80))

  // Use versioned prompts with markdown template
  const systemPrompt = prompts.clinicalNote.currentVersion.getSystemPrompt(noteLength, template)
  const userPrompt = prompts.clinicalNote.currentVersion.getUserPrompt({
    transcript,
    patient_name,
    visit_reason,
    noteLength,
    template,
  })

  try {
    console.log("🤖 Calling LLM to generate markdown clinical note...")
    console.log(`📌 Using prompt version: ${prompts.clinicalNote.currentVersion.PROMPT_VERSION}`)
    console.log(`🤖 Model: ${prompts.clinicalNote.currentVersion.MODEL_OPTIMIZED_FOR}`)
    
    const text = await runLLMRequest({
      system: systemPrompt,
      prompt: userPrompt,
      model: prompts.clinicalNote.currentVersion.MODEL_OPTIMIZED_FOR,
      // No JSON schema - direct text generation
    })

    // Extract markdown from response (handles code fences)
    const cleanedMarkdown = extractMarkdownFromResponse(text)
    
    // Normalize section headings to standard format
    const normalizedMarkdown = normalizeMarkdownSections(cleanedMarkdown)

    console.log("=".repeat(80))
    console.log("FINAL CLINICAL NOTE:")
    console.log("=".repeat(80))
    console.log(normalizedMarkdown)
    console.log("=".repeat(80))

    return normalizedMarkdown
  } catch (error) {
    console.error("❌ Failed to generate clinical note:", error)
    console.warn("⚠️  Returning empty note due to error")
    const emptyNote = createEmptyMarkdownNote()
    console.log("=".repeat(80))
    console.log("FINAL CLINICAL NOTE (ERROR FALLBACK):")
    console.log("-".repeat(80))
    console.log(emptyNote)
    console.log("-".repeat(80))
    console.log("=".repeat(80))
    return emptyNote
  }
}
