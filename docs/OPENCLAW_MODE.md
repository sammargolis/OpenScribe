# OpenClaw Mode — "let OpenClaw cook" (experimental POC)

> **This is a for-fun proof of concept. It is NOT for clinical decision-making and NOT
> production automation.** The planner is an LLM reading a generated note; every suggestion
> is unverified model output. The UI says so, in the Settings section and on every Claw Report.

Issue: [#35](https://github.com/sammargolis/OpenScribe/issues/35)

## What it does

1. A note is generated exactly as it is today.
2. If `openClawMode` is `off` (the default), nothing else happens — no planner call, no audit
   entries, no UI change.
3. If it is `suggest_only` or `tiny_actions_only`, the finished note is handed to a planner,
   which returns a JSON action list.
4. The policy engine decides what may run. The result is rendered as a **Claw Report**:
   executed actions, suggestions, and blocked actions with machine-readable reasons.

## Modes

| Mode                | Behaviour |
| ------------------- | --------- |
| `off` (default)     | Feature is inert. The planner is never called. |
| `suggest_only`      | Recommended. Proposes actions and executes **nothing**, ever. |
| `tiny_actions_only` | Executes **only** allowlisted local-only actions that also clear the confidence threshold and payload contract. Everything else is blocked and logged. |

Stored in `packages/storage/src/preferences.ts` as `openClawMode`, defaulting to `"off"`.

## Allowlist (the only things that can ever execute)

| Action type             | Effect (local only) | Payload contract |
| ----------------------- | ------------------- | ---------------- |
| `create_task`           | Appends to a local task list in `localStorage` | `{ title: string(1..200), detail?: string(<=500) }` |
| `set_followup_reminder` | Appends a local reminder with a computed due date | `{ dueInDays: int 1..365, detail?: string(<=500) }` |
| `tag_encounter`         | Appends a local metadata tag | `{ tag: string(1..48), `[A-Za-z0-9_- ]`only }` |

Everything else — faxes, orders, e-mails, EHR writes, deletions — is blocked with
`not_allowlisted`. There is no network call in any executor; records go to the
`openscribe_openclaw_records` key in `localStorage` and nowhere else.

## Safety model / trust boundary

The planner output is **untrusted LLM output**. It must never be able to widen its own
permissions, so nothing about permission is decided by the model or by the prompt:

- **Parsing (`planActions`)** validates *shape only*, with zod. A malformed response is
  rejected rather than trusted. `type` is intentionally parsed as a free-form string so an
  unknown or hostile action type survives parsing and gets **blocked with a visible reason**
  instead of being silently dropped.
- **`applyPolicy` is the single chokepoint** and is a pure function. It is the only place
  where the mode gate, allowlist, confidence threshold and payload contracts are applied.
  It returns `{ proposed, executed, blocked }`, where `executed` means *approved to execute*.
- **`runOpenClaw` may only execute `decision.executed`.** In `suggest_only` that array is
  empty by construction (and frozen), so no executor is reachable — asserted by
  `packages/openclaw/src/__tests__/run.test.ts` ("SUGGEST_ONLY cannot reach an executor")
  with a tripwire executor registry that throws if it is ever invoked.
- `applyPolicy` additionally throws if it ever approves an action outside
  `tiny_actions_only`, so a future refactor fails loudly instead of quietly widening
  permissions.
- Executors re-validate their payload as defense in depth, and an action with no registered
  executor cannot run.
- The prompt does describe the allowlist, but purely as a convenience for the model. A model
  that ignores every word of it still cannot execute anything outside the allowlist.

## Failure isolation

The planner runs **after** the note has been generated and saved, fire-and-forget:

- `runOpenClaw` never throws. Planner transport failures, unparseable responses, policy
  refusals, executor failures and audit-write failures all resolve to a report the UI can
  display (`report.plannerError` / `blocked[].reasonCode`).
- The call site in `apps/web/src/app/page.tsx` is `void runOpenClawForNote(...)` inside its
  own `try/catch`, placed after `note_text` is persisted and the view has switched.
- Consequence: a dead planner degrades to "no Claw Report". The note workflow is untouched.

Scope note: the hook is wired into the mixed-mode (cloud) note path only, because the planner
uses the Anthropic key. In `local` processing mode the POC stays inert by design — local-only
users have deliberately opted out of cloud calls.

## Audit logging

Audit entries are written through the existing `writeAuditEntry` from
`packages/storage/src/audit-log.ts`:

| Event | When |
| ----- | ---- |
| `openclaw.actions_proposed` | Once per run, with counts, action types, confidences, threshold |
| `openclaw.action_executed`  | Once per executed action |
| `openclaw.action_blocked`   | Once per blocked action, with `reason_code` |
| `openclaw.planner_failed`   | Planner or policy failure |

**No PHI in logs.** Metadata carries action types, counts, confidences and block reason
codes only — never note text, payload contents or the model's free-text `reason`. Action
types are model-controlled strings, so a type that is not on the allowlist is logged as
`unlisted` rather than verbatim. This is covered by the test
"audit metadata carries no note text and no payload contents".

## Layout

```
packages/openclaw/src/
  types.ts       # contracts, allowlist, disclaimer text
  schema.ts      # zod shape + payload contracts for untrusted planner output
  planner.ts     # planActions / parsePlannerResponse (shape validation only)
  policy.ts      # applyPolicy — THE chokepoint, pure
  executors.ts   # the three allowlisted executors, local writes only
  store.ts       # ClawStore (localStorage / in-memory)
  prompt.ts      # planner prompt (convenience, not a control)
  run.ts         # orchestration: plan -> policy -> execute -> audit; never throws
  __tests__/     # 43 tests: mode gating, allowlist, failure handling, PHI-free audit
```

Glue outside the package (deliberately thin, so the POC is easy to delete):

- `apps/web/src/app/openclaw-actions.ts` — server action calling `runLLMRequest`.
- `apps/web/src/app/page.tsx` — fire-and-forget invocation + Claw Report rendering.
- `packages/ui/src/components/claw-report.tsx` — the Claw Report panel.
- `packages/ui/src/components/settings-dialog.tsx` — the mode toggle section.
- `packages/storage/src/types.ts` — four `openclaw.*` audit event types.
- `tsconfig.json` / `config/tsconfig.test.json` — the `@openclaw` path alias.

## Not the same thing as...

`NoteEditor` already has an unrelated "OpenClaw chat" handoff that talks to the desktop
backend over IPC (`openclaw-chat-turn`). This POC shares the name only; it has its own
package, its own planner path and no dependency on that feature.

## Removing the POC

Delete `packages/openclaw/`, `apps/web/src/app/openclaw-actions.ts`,
`packages/ui/src/components/claw-report.tsx`, the OpenClaw section in `settings-dialog.tsx`,
the OpenClaw block in `page.tsx`, the `@openclaw` aliases and the `openclaw.*` audit event
types. Nothing else depends on it.
