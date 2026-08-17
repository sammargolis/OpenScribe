import type { ClawRecord, ClawRecordKind, ClawStore } from "./types"

/** localStorage key for the local-only OpenClaw record list. */
export const CLAW_RECORDS_KEY = "openscribe_openclaw_records"

/** Hard cap so a runaway planner cannot fill local storage. */
const MAX_RECORDS = 500

/** In-memory store. Used by tests and as a fallback outside the browser. */
export function createMemoryClawStore(seed: readonly ClawRecord[] = []): ClawStore {
  const records: ClawRecord[] = [...seed]
  return {
    append(record) {
      records.push(record)
      if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS)
    },
    list(kind) {
      return kind ? records.filter((record) => record.kind === kind) : [...records]
    },
  }
}

function readRecords(): ClawRecord[] {
  try {
    const raw = window.localStorage.getItem(CLAW_RECORDS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ClawRecord[]) : []
  } catch {
    return []
  }
}

/**
 * Browser store. LOCAL ONLY — writes to localStorage and nowhere else.
 * There is deliberately no network path in any OpenClaw executor.
 */
export function createBrowserClawStore(): ClawStore {
  if (typeof window === "undefined") {
    return createMemoryClawStore()
  }

  return {
    append(record) {
      const records = readRecords()
      records.push(record)
      const trimmed = records.length > MAX_RECORDS ? records.slice(-MAX_RECORDS) : records
      try {
        window.localStorage.setItem(CLAW_RECORDS_KEY, JSON.stringify(trimmed))
      } catch {
        // Local storage full or unavailable: the POC drops the record rather
        // than interfering with anything else in the app.
      }
    },
    list(kind?: ClawRecordKind) {
      const records = readRecords()
      return kind ? records.filter((record) => record.kind === kind) : records
    },
  }
}
