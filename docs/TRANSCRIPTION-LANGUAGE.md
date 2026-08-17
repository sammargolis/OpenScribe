# Transcription Language

Transcription language can be set two ways: from the app UI (per user, persisted
locally) or from the server environment with `WHISPER_LANGUAGE`. The UI selector
is an override on top of the env default — it does not replace it.

## Choosing a language in the UI

`Settings -> Transcription Language -> Spoken Language`

| Option           | Code   |
| ---------------- | ------ |
| Auto (default)   | `auto` |
| English          | `en`   |
| Spanish          | `es`   |
| French           | `fr`   |
| German           | `de`   |
| Portuguese       | `pt`   |
| Chinese          | `zh`   |
| Hindi            | `hi`   |
| Arabic           | `ar`   |

The selection is stored in the `transcriptionLanguage` user preference
(`openscribe_preferences` in `localStorage`) and survives reload and app
restart. The default is `auto`.

The allowlist lives in `packages/ui/src/lib/transcription-languages.ts`. It is
the single source of truth for both the dropdown and server-side validation.

## Precedence

Highest to lowest:

1. **UI selection**, when it is a supported code other than `auto`.
2. **`WHISPER_LANGUAGE`** environment variable (see `apps/web/.env.local.example`).
3. **Whisper auto-detect** — the behaviour when neither is set.

`auto` in the UI is not "detect the language"; it means *"don't override"*. The
request is sent without a `language` field, so the transcribe providers keep
using `process.env.WHISPER_LANGUAGE || "auto"` exactly as before. Existing
deployments that only set `WHISPER_LANGUAGE` are unaffected by this feature.

One hard override sits above all of this: **English-only Whisper models**. Any
model whose name ends in `.en` (including the default `WHISPER_LOCAL_MODEL=tiny.en`)
can only transcribe English, so the language is forced to `en` regardless of the
UI or env setting. To transcribe another language locally, switch
`WHISPER_LOCAL_MODEL` to a multilingual model such as `base` or `small`. The
Settings panel states this inline, and the server logs a warning when an
override is discarded for this reason.

## How the value reaches Whisper

```
Settings dialog (packages/ui/src/components/settings-dialog.tsx)
  -> setPreferences({ transcriptionLanguage }) in localStorage
  -> apps/web/src/app/page.tsx
       |- POST /api/transcription/language   { session_id, language }   (at recording start)
       '- POST /api/transcription/final      formData "language" field
  -> apps/web/src/lib/transcription-language.ts   (validate + resolve precedence)
  -> transcribeWithWhisperLocal(buffer, filename, { language })
  -> POST WHISPER_LOCAL_URL with a "language" form field
  -> scripts/whisper_server.py  (language == "auto" is treated as None)
```

Segment uploads are queued by a shared controller that does not carry user
preferences, so the language is registered once per capture session via
`POST /api/transcription/language`. Both `/api/transcription/segment` and
`/api/transcription/final` read that session value, which keeps the live segment
preview and the final transcript in the same language. The final upload also
sends the language inline, so the final transcript is still correct if session
registration failed.

### Provider coverage

| Provider         | Per-request language | Notes                                         |
| ---------------- | -------------------- | --------------------------------------------- |
| `whisper_local`  | yes                  | Forwarded as the `language` form field        |
| `whisper_openai` | no                   | Falls back to `WHISPER_LANGUAGE`; logs a warning |
| `medasr`         | no                   | Falls back to `WHISPER_LANGUAGE`; logs a warning |

The local-only desktop pipeline (`local-only/openscribe-backend`) is also
env-configured only.

## Invalid values

Whisper language codes are a fixed set, so nothing is forwarded raw:

- **Bad value on a request** — `/api/transcription/segment`,
  `/api/transcription/final`, and `/api/transcription/language` answer
  `400 validation_error` with the list of supported codes
  (`InvalidTranscriptionLanguageError`). The audio is not transcribed with an
  unvalidated language.
- **Corrupted stored preference** — `normalizeTranscriptionLanguage()` collapses
  it to `auto`, so the dropdown shows `Auto (default)` and transcription keeps
  working.
- **`WHISPER_LANGUAGE`** is *not* validated against the UI allowlist. It accepts
  any ISO-639-1 code Whisper supports, so existing configurations such as
  `WHISPER_LANGUAGE=ja` continue to work even though Japanese is not in the
  dropdown.

Each transcription audit entry records the effective value as
`transcription_language` (`auto` when no override was applied).

## Tests

`packages/ui/src/lib/__tests__/transcription-languages.test.ts` — run with
`pnpm test`. Covers the `auto` default, explicit non-English selection,
precedence, persistence/restore through `localStorage`, and fallback plus
rejection of invalid values.
