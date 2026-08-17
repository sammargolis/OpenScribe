# Medplum Integration Design

**Date:** 2026-04-10
**Branch:** `feat/medplum-integration`
**Status:** Approved — ready for implementation

---

## Overview

One-way push integration from OpenScribe to Medplum: after a clinical note is generated, the user can push it to a Medplum FHIR server as a `DocumentReference` resource. Mirrors the existing OpenEMR integration in structure and UI pattern. Uses the official `@medplum/core` TypeScript SDK for authentication and FHIR operations.

---

## Architecture

New files added alongside the existing OpenEMR integration, following the same layered pattern: feature flag → client module → API routes → UI button.

```
next.config.mjs
  └─ NEXT_PUBLIC_MEDPLUM_ENABLED (build-time feature flag)

apps/web/src/lib/
  └─ medplum-client.ts          ← MedplumClient singleton (MemoryStorage-backed),
                                   sentinel error mapping, re-auth on token expiry

apps/web/src/app/api/integrations/medplum/
  ├─ push/route.ts              ← POST: validate patient → create DocumentReference
  └─ status/route.ts            ← GET: isMedplumConfigured() → { configured: bool }

packages/pipeline/render/src/components/
  └─ note-editor.tsx            ← "Push to Medplum" button (conditional on flag)
                                   added alongside existing "Push to OpenEMR" button
```

No changes required to `new-encounter-form.tsx` — `patient_id` is already a required field from the OpenEMR integration.

### Environment Variables

Server-side only (never exposed to the client):

```
MEDPLUM_BASE_URL=        # e.g. http://localhost:8103 or https://api.medplum.com
MEDPLUM_CLIENT_ID=
MEDPLUM_CLIENT_SECRET=
```

Build-time (exposed to client via Next.js):

```
NEXT_PUBLIC_MEDPLUM_ENABLED=true|false
```

Integration test only:

```
MEDPLUM_TEST_PATIENT_ID=   # UUID of a real patient on the test server
```

---

## Components

### `medplum-client.ts`

Wraps `@medplum/core` and exposes four functions. The `MedplumClient` singleton is initialized with `MemoryStorage` (required for server-side Node.js environments — without it the SDK crashes on initialization since `localStorage` is unavailable).

```ts
import { MedplumClient, MemoryStorage } from '@medplum/core';

// Module-level singleton
let client: MedplumClient | null = null;

function getMedplumClient(): MedplumClient {
  if (!client) {
    client = new MedplumClient({
      baseUrl: process.env.MEDPLUM_BASE_URL,
      clientId: process.env.MEDPLUM_CLIENT_ID,
      clientSecret: process.env.MEDPLUM_CLIENT_SECRET,
      storage: new MemoryStorage(),
    });
  }
  return client;
}
```

**Exported functions:**

| Function | Description |
|---|---|
| `isMedplumConfigured()` | Returns `true` if all three server-side env vars are set |
| `getMedplumClient()` | Returns the module-level singleton (lazy-initialized) |
| `validatePatient(patientId)` | `GET Patient/{id}` via SDK; returns sentinel on failure |
| `pushDocumentReference(patientId, noteText, encounterId)` | Creates FHIR `DocumentReference`; returns `{ resourceId }` or sentinel |

**Sentinel error type:**

```ts
type MedplumPushError =
  | 'not_configured'
  | 'auth_failure'
  | 'patient_not_found'
  | 'network_error'
  | 'unknown_error';
```

### `DocumentReference` shape

```ts
{
  resourceType: 'DocumentReference',
  status: 'current',
  type: {
    coding: [{
      system: 'http://loinc.org',
      code: '11506-3',       // Progress note
      display: 'Progress note',
    }],
  },
  subject: { reference: `Patient/${patientId}` },
  content: [{
    attachment: {
      contentType: 'text/markdown',
      data: Buffer.from(noteText).toString('base64'),
    },
  }],
  context: {
    // encounterId is the OpenScribe internal encounter ID (not a Medplum Encounter resource).
    // Stored as a related reference for traceability; no Medplum Encounter resource is created.
    related: [{ reference: `Encounter/${encounterId}` }],
  },
}
```

### `push/route.ts`

`POST /api/integrations/medplum/push` — request body: `{ patientId, noteText, encounterId }`.

Orchestration: check configured → ensure authenticated → validate patient → push DocumentReference → audit log → return `{ resourceId }`.

### `status/route.ts`

`GET /api/integrations/medplum/status` — returns `{ configured: boolean }`. Used by the UI to decide whether to render the Push button without exposing credentials.

### `note-editor.tsx`

Adds a "Push to Medplum" button alongside the existing "Push to OpenEMR" button. Same state machine: `idle → pushing → success | error`. Button is only rendered when `NEXT_PUBLIC_MEDPLUM_ENABLED=true`.

---

## Data Flow

```
User clicks "Push to Medplum"
  │
  ├─ POST /api/integrations/medplum/push
  │    { patientId, noteText, encounterId }
  │
  ├─ isMedplumConfigured() → false → 400 not_configured
  │
  ├─ getMedplumClient()
  │    └─ returns singleton (MemoryStorage-backed)
  │         └─ if !client.getActiveLogin() or token expired:
  │              await client.startClientLogin(clientId, clientSecret)
  │                   └─ failure → sentinel: auth_failure
  │
  ├─ validatePatient(patientId)
  │    └─ SDK GET Patient/{id}
  │         ├─ 404       → sentinel: patient_not_found
  │         └─ 401       → re-authenticate once, retry
  │                           └─ persistent failure → auth_failure
  │
  └─ pushDocumentReference(patientId, noteText, encounterId)
       └─ SDK createResource(DocumentReference)
            ├─ contentType: text/markdown, base64-encoded note
            ├─ LOINC 11506-3 ("Progress note")
            ├─ subject: Patient/{patientId}
            │
            ├─ success → { resourceId: DocumentReference.id }
            └─ error   → mapped sentinel

Audit log: push event recorded (encounter ID only, no PHI) on success and failure
```

**Re-authentication:** `getMedplumClient()` calls `client.startClientLogin()` if `client.getActiveLogin()` is absent or the token is expired. If a FHIR call returns `401` (race condition: token expired mid-flight), the client re-authenticates once and retries before giving up with `auth_failure`. With `MemoryStorage` and the client_credentials flow, there is no refresh token — re-authentication issues a new access token.

---

## Error Handling

Medplum returns FHIR `OperationOutcome` on errors. The client maps `OperationOutcome.issue[].code` to sentinels; anything unmapped falls through to `unknown_error`. `429` (rate limit exceeded) maps to `network_error` with a log entry.

| Sentinel | HTTP status returned | User-facing message |
|---|---|---|
| `not_configured` | 400 | "Medplum integration is not configured" |
| `auth_failure` | 502 | "Failed to authenticate with Medplum" |
| `patient_not_found` | 404 | "Patient not found in Medplum" |
| `network_error` | 502 | "Could not reach Medplum server" |
| `unknown_error` | 500 | "An unexpected error occurred" |

---

## Testing

### Trust Boundary Tests (`medplum-client.test.ts`)

Mocked — no real network. Target ~12–15 tests.

- `isMedplumConfigured()` — true when all three env vars set; false for each missing var
- `getMedplumClient()` — singleton returns same instance on repeated calls
- Authentication — `startClientLogin()` called when no active login; re-auth triggered on expired token; `auth_failure` sentinel on credential rejection
- `validatePatient()` — success returns patient resource; `patient_not_found` on 404; `auth_failure` on 401 with failed re-auth
- `pushDocumentReference()` — success returns `resourceId`; attachment is `text/markdown` base64; LOINC code `11506-3` present; `network_error` on timeout; `unknown_error` on unmapped `OperationOutcome`; `429` maps to `network_error`
- Route tests — missing body fields → 400; each sentinel propagates to correct HTTP status

### Real Integration Test (`medplum-client.integration.test.ts`)

Runs against the live Medplum server. Skipped automatically when env vars are absent. Invoked via `pnpm test:medplum` (new script entry in root `package.json`, parallel to `pnpm test:llm`).

**Steps:**

1. Authenticate via `startClientLogin()` against `MEDPLUM_BASE_URL`
2. Look up `MEDPLUM_TEST_PATIENT_ID` — assert patient exists
3. Push a `DocumentReference` with a synthetic markdown note
4. Read the created resource back by ID — assert `contentType: text/markdown`, LOINC code `11506-3`, correct patient reference
5. Delete the test resource (clean up server state)

---

## What Is Not In Scope

- Two-way sync (reading data from Medplum into OpenScribe)
- Patient search by MRN or name (patient UUID is entered directly)
- Medplum-specific patient enrollment UI
- Shared FHIR push abstraction across EHR integrations (deferred; revisit when a third EHR is added)
