import { z } from "zod"

/**
 * Shape validation for untrusted planner output.
 *
 * Deliberate design choice: `type` is a free-form non-empty string, NOT a zod
 * enum. Permission is not a parsing concern — unknown/hostile action types must
 * reach `applyPolicy` so they get blocked with a visible reason instead of being
 * silently dropped here.
 */
export const clawActionSchema = z.object({
  type: z.string().trim().min(1).max(64),
  payload: z.record(z.unknown()).default({}),
  confidence: z.number().finite().min(0).max(1),
  reason: z.string().trim().min(1).max(400),
})

export const plannerResponseSchema = z.object({
  actions: z.array(z.unknown()).max(50),
})

/** Payload contracts for the allowlisted action types. */
export const createTaskPayloadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(500).optional(),
})

export const followupReminderPayloadSchema = z.object({
  dueInDays: z.number().int().min(1).max(365),
  detail: z.string().trim().max(500).optional(),
})

export const tagEncounterPayloadSchema = z.object({
  tag: z
    .string()
    .trim()
    .min(1)
    .max(48)
    .regex(/^[\w][\w\- ]*$/, "tag must be alphanumeric, dash, underscore or space"),
})

export const ALLOWLISTED_PAYLOAD_SCHEMAS: Record<string, z.ZodTypeAny> = {
  create_task: createTaskPayloadSchema,
  set_followup_reminder: followupReminderPayloadSchema,
  tag_encounter: tagEncounterPayloadSchema,
}

/** Compact zod issue summary. Never includes the offending values. */
export function summarizeZodIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 4)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.code}`)
    .join("; ")
}
