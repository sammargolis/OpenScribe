# Note Model Providers

Note generation is the one LLM call in OpenScribe that is provider-configurable.
You can point it at any OpenAI SDK-compatible `/chat/completions` endpoint with
environment variables only — no code change, no rebuild of the pipeline.

Everything else (transcription, verification, prompts, note format) is
unaffected. Behavior with none of these variables set is identical to the
historical Anthropic path.

## Environment variables

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `NOTE_MODEL_PROVIDER` | no | `anthropic` | Provider id. `anthropic` uses the native Anthropic SDK. Any other value is treated as an OpenAI SDK-compatible endpoint. Case-insensitive. |
| `NOTE_MODEL_NAME` | for non-default providers | prompt version default (`claude-sonnet-4-5-20250929`) | Model id sent to the provider. When set, it overrides the model the prompt version asks for. |
| `NOTE_MODEL_BASE_URL` | for non-default providers without a built-in endpoint | provider default | Endpoint root, e.g. `https://api.openai.com/v1`. `/chat/completions` is appended. Must be HTTPS (see [Transport security](#transport-security)). |
| `NOTE_MODEL_API_KEY` | for non-default providers | — | Sent as `Authorization: Bearer …`. Not needed for the default provider, which already receives the key the app stores in Settings via `getAnthropicApiKey()`. |
| `NOTE_MODEL_TIMEOUT_MS` | no | `45000` | Request timeout for OpenAI-compatible providers. The Anthropic path keeps using `ANTHROPIC_TIMEOUT_MS`. |

Providers with a built-in endpoint (so `NOTE_MODEL_BASE_URL` is optional):

| Provider id | Base URL |
| --- | --- |
| `openai` | `https://api.openai.com/v1` |

Any other provider id must supply `NOTE_MODEL_BASE_URL`, otherwise config
resolution fails with a clear error at request time.

## Example: default provider (Anthropic)

Nothing to configure. The API key comes from Settings (or `ANTHROPIC_API_KEY`),
and the model comes from the current prompt version.

```bash
# .env.local — the default, shown explicitly for reference
ANTHROPIC_API_KEY=sk-ant-...
# NOTE_MODEL_PROVIDER=anthropic   # implied
```

Optional overrides on the default path:

```bash
NOTE_MODEL_NAME=claude-haiku-4-5          # cheaper/faster note model
NOTE_MODEL_BASE_URL=https://anthropic-proxy.internal   # HTTPS gateway/proxy
```

## Example: an alternate OpenAI-compatible endpoint

Any provider that speaks the OpenAI chat completions contract works. Example
with a self-hosted vLLM server behind TLS:

```bash
NOTE_MODEL_PROVIDER=vllm
NOTE_MODEL_BASE_URL=https://llm.hospital.example.org/v1
NOTE_MODEL_NAME=qwen2.5-72b-instruct
NOTE_MODEL_API_KEY=sk-local-...
```

OpenAI itself (endpoint filled in automatically):

```bash
NOTE_MODEL_PROVIDER=openai
NOTE_MODEL_NAME=gpt-4.1-mini
NOTE_MODEL_API_KEY=sk-...
```

A local model server on loopback (plaintext HTTP is allowed only here):

```bash
NOTE_MODEL_PROVIDER=ollama
NOTE_MODEL_BASE_URL=http://127.0.0.1:11434/v1
NOTE_MODEL_NAME=llama3.1:8b-instruct
NOTE_MODEL_API_KEY=ollama
```

Restart the app after changing these values; the config is read per request from
the process environment.

## Transport security

PHI leaves the process in these requests, so the wrapper validates the endpoint
before sending anything:

- `https:` endpoints are allowed.
- `http:` is allowed **only** for loopback hosts: `localhost`, `*.localhost`,
  `127.0.0.0/8`, and `::1`. This mirrors the local MedGemma path in
  `packages/llm-medgemma`.
- Anything else throws `SECURITY ERROR: NOTE_MODEL_BASE_URL must use HTTPS for
  HIPAA compliance` and no request is made.
- The check runs both when the config is resolved and inside the transport, so a
  programmatically supplied config cannot bypass it.

Two more PHI-related rules the wrapper enforces:

- The Anthropic key injected by the app is **never** forwarded to a third-party
  endpoint. Non-default providers must have their own `NOTE_MODEL_API_KEY`.
- Provider error bodies are not echoed into error messages (they routinely
  contain the submitted transcript). Failures surface as
  `Note model request failed: <status> <statusText> (<provider error code>)`.

## Architecture

```
packages/pipeline/note-core/src/note-generator.ts   createClinicalNoteText()
  └─ packages/llm/src/note-model/client.ts          generateNoteCompletion()
       ├─ packages/llm/src/note-model/config.ts     resolveNoteModelConfig(env)
       ├─ packages/llm/src/providers/anthropic.ts            (default)
       └─ packages/llm/src/providers/openai-compatible.ts    (everything else)
```

- `resolveNoteModelConfig(env)` is pure: env in, validated config out. It throws
  on missing or unsafe configuration.
- `generateNoteCompletion({ system, prompt, model?, apiKey?, config? })` returns
  `{ text, provider, model }`. The note service only reads `text`; `provider`
  and `model` are debug-logged (non-PHI).
- The note service never imports a provider SDK. Prompt building, markdown
  extraction, section normalization, and the `note_generation_error` pipeline
  error are all unchanged.

### Why `fetch` instead of the `openai` package

The OpenAI-compatible transport is implemented with `fetch` against the
documented `POST {baseUrl}/chat/completions` contract instead of the official
`openai` npm package. OpenScribe ships an offline desktop build, and adding a
runtime dependency was out of scope for this change. The request/response
mapping is isolated in `packages/llm/src/providers/openai-compatible.ts`, so
replacing the body of `runOpenAICompatibleCompletion()` with
`new OpenAI({ baseURL, apiKey }).chat.completions.create(...)` is a one-file
change with no impact on callers or config.

## Adding a new compatible provider

If the provider speaks the OpenAI chat completions contract, there is nothing to
add — set the four environment variables and you are done.

You only need to touch code in two cases:

1. **You want its endpoint built in** so `NOTE_MODEL_BASE_URL` can be omitted.
   Add one entry to `KNOWN_OPENAI_COMPATIBLE_BASE_URLS` in
   `packages/llm/src/note-model/config.ts`, and a row to the table above.

2. **The provider is not OpenAI-compatible** (native Anthropic-style, Google,
   Bedrock, …). Then:
   - Add `packages/llm/src/providers/<provider>.ts` exporting
     `run<Provider>Completion(request): Promise<string>`. Call
     `assertSecureEndpoint(baseUrl, "NOTE_MODEL_BASE_URL")` before the request,
     and keep provider response bodies out of error messages.
   - Add the transport id to `NoteModelTransport` in
     `packages/llm/src/note-model/config.ts` and map the provider id to it in
     `resolveNoteModelConfig()`, including whatever env values it requires.
   - Add a branch in `generateNoteCompletion()`
     (`packages/llm/src/note-model/client.ts`).
   - Cover it in `packages/llm/src/__tests__/note-model-config.test.ts` and
     `packages/llm/src/__tests__/note-model-client.test.ts`. Tests stub
     `globalThis.fetch`; no network access is required.

Note-generation output must not change: the prompt flow, markdown format, and
error codes are contractual for the rest of the pipeline.

## Tests

```bash
pnpm test:llm    # config resolution, wrapper, HTTPS/PHI invariants
pnpm test:note   # note generation routes through the wrapper end to end
```
