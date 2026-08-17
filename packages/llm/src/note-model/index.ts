export { generateNoteCompletion } from "./client"
export type { NoteCompletionInput, NoteResult } from "./client"
export {
  DEFAULT_NOTE_MODEL_PROVIDER,
  NOTE_MODEL_ENV_KEYS,
  isDefaultNoteModelProvider,
  resolveNoteModelConfig,
} from "./config"
export type {
  AnthropicNoteModelConfig,
  NoteModelConfig,
  NoteModelEnv,
  NoteModelTransport,
  OpenAICompatibleNoteModelConfig,
} from "./config"
