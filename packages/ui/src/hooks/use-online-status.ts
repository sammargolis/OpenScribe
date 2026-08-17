"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Connectivity detection for API-dependent pipeline steps.
 *
 * `navigator.onLine` only reports link-layer state: a laptop attached to a
 * captive-portal Wi-Fi reports "online" while every request fails. So the
 * `online`/`offline` events are the cheap baseline signal and a periodic
 * no-cors reachability probe is the tiebreaker. A failed probe counts as
 * offline.
 *
 * The probe is opt-in per caller (`enableProbe`) so local-only mode makes zero
 * network requests.
 */

/** Mixed mode's actual cloud dependency, so the probe tests what matters. */
const DEFAULT_PROBE_URL = "https://api.anthropic.com/"
const DEFAULT_PROBE_INTERVAL_MS = 60_000
const PROBE_TIMEOUT_MS = 5_000

export type OnlineStatusSource = "initial" | "navigator" | "probe"

export interface OnlineStatusSnapshot {
  online: boolean
  /** Which signal produced the current value. */
  source: OnlineStatusSource
  lastCheckedAt: number | null
}

export interface OnlineStatus extends OnlineStatusSnapshot {
  /** Force an immediate reachability re-check, e.g. from a "retry" button. */
  recheck: () => void
}

export interface UseOnlineStatusOptions {
  /** Reachability probe target. Must tolerate an opaque `no-cors` GET. */
  probeUrl?: string
  probeIntervalMs?: number
  /** When false, only `navigator.onLine` and the window events are used. */
  enableProbe?: boolean
  /** Injectable for tests. */
  fetchImpl?: typeof fetch
}

function readNavigatorOnline(): boolean {
  if (typeof navigator === "undefined") return true
  // Treat an absent flag as online rather than falsely alarming the user.
  return navigator.onLine !== false
}

export function useOnlineStatus({
  probeUrl = DEFAULT_PROBE_URL,
  probeIntervalMs = DEFAULT_PROBE_INTERVAL_MS,
  enableProbe = true,
  fetchImpl,
}: UseOnlineStatusOptions = {}): OnlineStatus {
  // Start optimistic and identical on server and client so hydration matches.
  const [snapshot, setSnapshot] = useState<OnlineStatusSnapshot>({
    online: true,
    source: "initial",
    lastCheckedAt: null,
  })

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const probeInFlightRef = useRef(false)
  const mountedRef = useRef(true)
  /** Bumped on teardown so a probe aborted mid-flight cannot apply a stale result. */
  const generationRef = useRef(0)

  const apply = useCallback((online: boolean, source: OnlineStatusSource) => {
    if (!mountedRef.current) return
    setSnapshot((previous) =>
      previous.online === online && previous.source === source
        ? { ...previous, lastCheckedAt: Date.now() }
        : { online, source, lastCheckedAt: Date.now() },
    )
  }, [])

  const runProbe = useCallback(async () => {
    if (!readNavigatorOnline()) {
      apply(false, "navigator")
      return
    }
    if (!enableProbe) {
      apply(true, "navigator")
      return
    }
    // Skip work while the tab is hidden; the `online` event and the next
    // interval tick cover the user coming back.
    if (typeof document !== "undefined" && document.hidden) return
    if (probeInFlightRef.current) return

    const doFetch = fetchImpl ?? (typeof fetch === "function" ? fetch : null)
    if (!doFetch) {
      apply(true, "navigator")
      return
    }

    probeInFlightRef.current = true
    const generation = generationRef.current
    const controller = new AbortController()
    abortRef.current = controller
    timeoutRef.current = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)

    try {
      await doFetch(probeUrl, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal,
      })
      if (generation === generationRef.current) apply(true, "probe")
    } catch {
      // An opaque `no-cors` response still resolves, so reaching here means the
      // request never completed: DNS failure, timeout, or no route. A generation
      // mismatch means we aborted it ourselves, which says nothing about the network.
      if (generation === generationRef.current) apply(false, "probe")
    } finally {
      probeInFlightRef.current = false
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      if (abortRef.current === controller) {
        abortRef.current = null
      }
    }
  }, [apply, enableProbe, fetchImpl, probeUrl])

  useEffect(() => {
    mountedRef.current = true
    if (typeof window === "undefined") return

    const handleOnline = () => {
      apply(true, "navigator")
      void runProbe()
    }
    const handleOffline = () => apply(false, "navigator")

    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)

    if (readNavigatorOnline()) {
      void runProbe()
    } else {
      apply(false, "navigator")
    }

    if (enableProbe) {
      intervalRef.current = setInterval(() => void runProbe(), probeIntervalMs)
    }

    return () => {
      mountedRef.current = false
      generationRef.current += 1
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      abortRef.current?.abort()
      abortRef.current = null
      probeInFlightRef.current = false
    }
  }, [apply, enableProbe, probeIntervalMs, runProbe])

  const recheck = useCallback(() => {
    void runProbe()
  }, [runProbe])

  return { ...snapshot, recheck }
}
