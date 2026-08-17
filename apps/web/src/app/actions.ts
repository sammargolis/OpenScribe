"use server"

import type { ClinicalNoteRequest } from "@note-core"
import { createClinicalNoteText } from "@note-core"
import { getAnthropicApiKey } from "@storage/server-api-keys"
import { writeAuditEntry } from "@storage/audit-log"

/**
 * `template` carries the resolved markdown template. `templateId` is the
 * human-readable selection ("default" | "soap" | "custom") and is used for
 * audit metadata so we never write a whole markdown template into the log.
 */
export type GenerateClinicalNoteParams = ClinicalNoteRequest & {
  templateId?: string
}

export async function generateClinicalNote(params: GenerateClinicalNoteParams): Promise<string> {
  const apiKey = getAnthropicApiKey()
  const { templateId, ...request } = params
  const auditTemplateId = templateId || (request.template ? "custom" : "default")

  try {
    // Audit log: note generation started
    await writeAuditEntry({
      event_type: "note.generation_started",
      success: true,
      metadata: {
        template: auditTemplateId,
        transcript_length: params.transcript?.length || 0,
      },
    })

    const result = await createClinicalNoteText({ ...request, apiKey })

    // Audit log: note generated successfully
    await writeAuditEntry({
      event_type: "note.generated",
      success: true,
      metadata: {
        template: auditTemplateId,
        note_length: result.length,
      },
    })

    return result
  } catch (error) {
    // Audit log: note generation failed
    await writeAuditEntry({
      event_type: "note.generation_failed",
      success: false,
      error_message: error instanceof Error ? error.message : String(error),
      metadata: {
        template: auditTemplateId,
      },
    })

    throw error
  }
}
