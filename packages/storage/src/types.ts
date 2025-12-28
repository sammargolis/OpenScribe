export type EncounterStatus =
  | "idle"
  | "recording"
  | "processing"
  | "transcription_failed"
  | "note_generation_failed"
  | "completed"

export interface Encounter {
  id: string
  patient_name: string
  patient_id: string
  visit_reason: string
  session_id?: string
  created_at: string
  updated_at: string
  audio_blob?: Blob
  transcript_text: string
  /**
   * Clinical note in markdown format
   * This is the primary storage format for notes
   */
  note_text: string
  status: EncounterStatus
  language: string
  recording_duration?: number
}
