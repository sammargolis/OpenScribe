# OpenScribe Architecture

This document describes how the repository is structured today, why each
folder exists, and where new code should live as the system grows.

---

## Top-Level Layout

| Path | Purpose |
| --- | --- |
| `apps/` | Runtime entry points (Next.js, future apps). Each subfolder is an independently deployable UI or service. |
| `packages/` | Reusable domain modules shared across apps. Every non-Next TypeScript package lives here. |
| `config/` | Centralized tool configuration (Next, PostCSS, TypeScript test config, shadcn). Apps import from here. |
| `build/` | The **only** location for generated artifacts (Next standalone output, packaged binaries, compiled tests, etc.). Safe to delete between builds. |
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `README.md`, `.env*` | Root-level project metadata and shared TypeScript config. |

No other source files should sit at the root—add them to the appropriate
`apps/` or `packages/` subtree.

---

## apps/

### `apps/web`

* Next.js (App Router) implementation of OpenScribe.
* Directory tree:

  ```
  apps/web/
    .env.local              # app-specific secrets (OPENAI_API_KEY, NEXT_PUBLIC_SECURE_STORAGE_KEY)
    next-env.d.ts
    next.config.mjs         # re-exports config/next.config.mjs
    postcss.config.mjs      # re-exports config/postcss.config.mjs
    tailwind.config.ts      # Tailwind v4 config (scans app + packages)
    src/
      app/                  # routes, layouts, server actions, CSS entry point
      middleware.ts
      types/
    public/                 # images, icons, worklets
  ```

* All UI composition, routing, and server actions belong here.
* Future web-only features (e.g., marketing pages, admin panels) can live
  inside `apps/web/src/app`.
* If another frontend appears (mobile/desktop), add another folder under
  `apps/` and import the same packages.

---

## packages/

The `packages/` directory acts like a pnpm workspace. Each folder hosts an
isolated TypeScript package with its own `src/` tree. Path aliases defined in
`tsconfig.json` (e.g., `@audio`, `@storage`, `@ui`) map into these packages,
so apps can import domain logic without relative paths.

### `packages/pipeline`

Ordered processing stages that reflect the end-to-end workflow. Every stage
exposes a small API/contract so it can be tested and swapped individually.

```
packages/pipeline/
  audio-ingest/
  transcribe/
  assemble/
  note-core/
  render/
  eval/
```

* **audio-ingest** – microphone/system audio capture hooks, resamplers,
  worklets, permission helpers.
* **transcribe** – Whisper adapters, segment uploader hook, WAV parsing.
* **assemble** – streaming session store, SSE helpers, overlap
  trimming, diarization scaffolding.
* **note-core** – clinical note domain models, parsing/formatting logic,
  LLM orchestration (calls into `@llm`).
* **render** – React components for presenting structured notes and
  exporters (SOAP renderer, specialty variants).
* **eval** – regression/evaluation harness plus anonymized fixtures and
  test cases (`pnpm test:audio` compiles this package).

When expanding the pipeline (e.g., add “07_quality_control” or “08_storage”),
create another subdirectory and add a new path alias if needed.

### `packages/ui`

Reusable React components, hooks, and UI utilities consumed by the apps.
Examples: encounter list, recording view, shared buttons, Radix wrappers,
`useEncounters` hook. UI-only work that is not tied to Next-specific routing
belongs here so other apps (Electron, mobile) can reuse it.

### `packages/storage`

Secure storage utilities and repositories:

* `secure-storage.ts` – AES-GCM helpers (requires `NEXT_PUBLIC_SECURE_STORAGE_KEY`).
* `encounters.ts` – CRUD helpers for encounter objects.
* `types.ts` – domain types shared between frontend and backend.

Future persistence layers (SQLite, filesystem, remote sync) can live alongside
the current browser implementation; apps keep importing `@storage/*`.

### `packages/llm`

Provider-agnostic LLM abstraction. Today it exposes a thin wrapper around
OpenAI via `runLLMRequest`, but it is the home for:

* Additional providers (Anthropic, Azure, local models).
* Prompt templates shared across pipeline stages.
* Retry/rate-limiting/shared logging for LLM calls.

### `packages/shell`

Electron “main” process, preload scripts, IPC contracts, desktop packaging
scripts (`scripts/prepare-next.js`, `next-server.js`). When the desktop app
gains new OS integrations (screen capture, auto-update, etc.), the code lives
here. Renderer UI should continue to import from `packages/ui`/pipeline rather
than duplicating logic.

### `packages/tests`

Placeholder for shared test harnesses outside the pipeline packages. Use this
when introducing cross-cutting integration tests, mocks, or helpers that are
not tied to a specific pipeline stage.

---

## config/

Holds all shared tool configuration. Current files:

* `next.config.mjs` – base Next configuration (CSP, headers, standalone
  output to `build/web`).
* `postcss.config.mjs` – Tailwind v4 plugin setup.
* `tsconfig.test.json` – TypeScript config used by `pnpm build:test`.
* `components.json` – shadcn UI CLI settings (points to `@ui` aliases).

Add future configs (ESLint, Jest/Vitest, Storybook) here and have apps import
them via small stubs (similar to `apps/web/next.config.mjs`).

---

## build/

Generated artifacts only. Expected subfolders:

* `build/web/` – output of `pnpm build` (Next standalone server, static assets).
* `build/tests-dist/` – compiled test sources (`pnpm build:test`).
* `build/dist/` – packaged binaries (Electron DMG/ZIP) when running
  `pnpm build:desktop`.

This directory should be safe to delete at any time and is git-ignored.

---

## TypeScript Configuration

* Root `tsconfig.json` sets `baseUrl` and the aliases for every package
  (`@audio`, `@transcription`, `@storage`, `@ui`, etc.). Apps inherit from
  this file.
* `apps/web/tsconfig.json` extends the root config and only overrides
  `baseUrl`/paths for `@/*` so Next.js tooling works locally.
* Tests compile using `config/tsconfig.test.json`, which emits to
  `build/tests-dist`.

---

## Environment Variables

* App-specific secrets live in `apps/web/.env.local` (ignored by Git). For
  example:
  ```
  OPENAI_API_KEY=...
  NEXT_PUBLIC_SECURE_STORAGE_KEY=base64-32-byte-secret
  ```
* Provide defaults/template via `apps/web/.env.local.example`.
* Future apps should follow the same pattern (keep `.env.local` next to the
  app, not at the repo root).

---

## Adding New Functionality

1. Decide whether it is **app-specific** or **shared**.
   * App UI, routing, server actions → `apps/<app-name>/src/...`
   * Shared React components/hooks → `packages/ui`
   * Pipeline/domain logic → the appropriate `packages/pipeline/0x_*`
   * Persistence → `packages/storage`
   * LLM providers/prompts → `packages/llm`
   * Desktop-only features → `packages/shell`
2. Update aliases in `tsconfig.json` if a new package is added.
3. Keep generated assets confined to `build/`.

By following this structure, the project stays modular: each domain evolves in
its own package, apps consume those packages, and tooling sits in `config/`.
