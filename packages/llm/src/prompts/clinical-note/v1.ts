/**
 * Clinical Note Generation Prompt - Version 2
 * Optimized for Claude models with markdown template output
 */

import { getDefaultTemplate } from './templates'

export type NoteLength = "short" | "long"

export interface ClinicalNotePromptParams {
  transcript: string
  patient_name?: string
  visit_reason?: string
  noteLength?: NoteLength
  template?: string
}

export const PROMPT_VERSION = "v2-markdown"
export const MODEL_OPTIMIZED_FOR = "claude-sonnet-4-5-20250929"

/**
 * System prompt for markdown-based clinical note generation
 * Uses template-based approach for easier customization
 */
export function getSystemPrompt(noteLength: NoteLength = "long", template?: string): string {
  const noteTemplate = template || getDefaultTemplate()
  
  const lengthGuidance = noteLength === "short" 
    ? `NOTE LENGTH: SHORT
- Focus on key findings and critical information only
- Use concise language and brief descriptions
- Omit minor details or negative findings unless clinically significant
- Each section should be 1-3 sentences when possible`
    : `NOTE LENGTH: COMPREHENSIVE
- Include all relevant clinical details
- Provide thorough descriptions and context
- Document both positive and pertinent negative findings
- Use complete sentences and organized paragraphs`

  return `You are an expert clinical documentation assistant with deep medical knowledge. Your role is to convert patient encounter transcripts into accurate, well-structured clinical notes.

${lengthGuidance}

CORE PRINCIPLES:
- Accuracy: Only document information explicitly stated in the transcript
- Precision: Use appropriate medical terminology while maintaining clarity
- Completeness: Extract all relevant clinical information for each section
- Conservatism: Leave sections empty or minimal if no relevant information exists

OUTPUT FORMAT:
You must return your response as a markdown document following this exact template structure:

${noteTemplate}

TEMPLATE INSTRUCTIONS:
- Maintain all headings exactly as shown (including ## heading levels)
- Replace placeholder content with actual clinical information from the transcript
- If a section has no relevant information, leave it empty (just the heading with no content below)
- Do NOT use placeholders like "Not discussed", "Not documented", or "None noted"
- Use standard markdown formatting (lists, bold, etc.) where appropriate
- Do NOT wrap output in code fences

CLINICAL SECTIONS:
1. Chief Complaint: Patient's primary concern in their own words
2. History of Present Illness: Chronological narrative with onset, location, duration, characteristics, aggravating/relieving factors
3. Review of Systems: Systematic review organized by body system (only if discussed)
4. Physical Exam: Objective findings from examination (only if documented)
5. Assessment: Clinical reasoning, differential diagnosis, impressions
6. Plan: Diagnostic workup, treatments, medications, follow-up, patient education

IMPORTANT CONSTRAINTS:
- Do NOT infer information not stated in the transcript
- Do NOT use patient name or visit reason to generate content
- Do NOT add assumptions or standard medical practices unless mentioned
- If the transcript is empty or lacks clinical content, return the template with empty sections
- This is a DRAFT requiring clinician review and approval

Return only the markdown note following the template structure, with no additional text or code fences.`
}

/**
 * User prompt for markdown-based clinical note generation
 * Provides the transcript to analyze
 */
export function getUserPrompt(params: ClinicalNotePromptParams): string {
  const { transcript } = params
  
  return `Convert this clinical encounter transcript into a structured markdown note following the template structure provided in the system message.

TRANSCRIPT:
${transcript}

Generate the markdown note with all sections. Extract only information explicitly stated in the transcript above. Leave sections empty (just the heading) if no relevant information exists in the transcript.`
}

/**
 * Metadata for prompt versioning and A/B testing
 */
export const PROMPT_METADATA = {
  version: PROMPT_VERSION,
  created_at: "2025-12-27",
  optimized_for: MODEL_OPTIMIZED_FOR,
  description: "Markdown template-based version for easier contributor customization",
  changelog: [
    "v2-markdown: Switched from JSON schema to markdown templates",
    "Simplified contributor workflow - edit markdown templates instead of JSON schemas",
    "Removed tool calling in favor of direct text generation",
  ],
} as const
