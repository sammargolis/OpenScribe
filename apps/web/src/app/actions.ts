"use server"

import type { ClinicalNoteRequest } from "@note-core"
import { createClinicalNoteText } from "@note-core"

export async function generateClinicalNote(params: ClinicalNoteRequest): Promise<string> {
  return createClinicalNoteText(params)
}
