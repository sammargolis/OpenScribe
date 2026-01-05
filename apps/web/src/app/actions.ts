"use server"

import type { ClinicalNoteRequest } from "@note-core"
import { createClinicalNoteText } from "@note-core"
import { getAnthropicApiKey } from "@storage/server-api-keys"

export async function generateClinicalNote(params: ClinicalNoteRequest): Promise<string> {
  const apiKey = getAnthropicApiKey()
  return createClinicalNoteText({ ...params, apiKey })
}
