"use client"

import { AlertTriangle, CheckCircle2, Cpu, Wifi, WifiOff } from "lucide-react"
import type { CapabilityStatus } from "@ui/lib/capability-status"

interface OfflineStatusIndicatorProps {
  status: CapabilityStatus
}

/**
 * Per-capability readiness for the sidebar: which pipeline steps can run right
 * now, in words as well as icons, inside a polite live region so screen readers
 * announce a connectivity change.
 */
export function OfflineStatusIndicator({ status }: OfflineStatusIndicatorProps) {
  const NetworkIcon = status.online ? Wifi : WifiOff
  const networkLabel = status.online ? "Online" : "Offline"

  return (
    <div className="shrink-0 border-t border-sidebar-border bg-sidebar px-4 py-3">
      <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground/60">
        Readiness
      </p>
      <div role="status" aria-live="polite" aria-atomic="true" className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <NetworkIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">
            {networkLabel}
            {status.processingMode === "local" ? " · Local-only mode" : " · Mixed mode"}
          </span>
        </div>
        {status.steps.map((step) => {
          const available = step.status === "available"
          const StepIcon = available ? CheckCircle2 : AlertTriangle
          return (
            <div
              key={step.id}
              className={
                available
                  ? "flex items-center gap-2 text-xs text-muted-foreground"
                  : "flex items-center gap-2 text-xs font-medium text-amber-600 dark:text-amber-500"
              }
            >
              <StepIcon aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {step.label}: {step.statusLabel}
              </span>
            </div>
          )
        })}
        <p
          className={
            status.severity === "blocked"
              ? "mt-1 text-xs leading-snug text-amber-600 dark:text-amber-500"
              : "mt-1 text-xs leading-snug text-muted-foreground/70"
          }
        >
          {status.headline}. {status.message}
        </p>
      </div>
    </div>
  )
}

interface OfflineBlockedDialogProps {
  status: CapabilityStatus
  localBackendAvailable: boolean
  onDismiss: () => void
  onRecheck: () => void
  onSwitchToLocal: () => void
  onOpenSettings: () => void
  /** Escape hatch: capture the transcript now and accept that the note will fail. */
  onProceedAnyway?: () => void
}

/**
 * Pre-recording guard. Shown instead of starting a recording that cannot
 * complete end to end, so nobody records a whole visit that dies at note
 * generation.
 */
export function OfflineBlockedDialog({
  status,
  localBackendAvailable,
  onDismiss,
  onRecheck,
  onSwitchToLocal,
  onOpenSettings,
  onProceedAnyway,
}: OfflineBlockedDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="offline-blocked-title"
        aria-describedby="offline-blocked-description"
        className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl"
      >
        <h3 id="offline-blocked-title" className="text-lg font-semibold text-foreground">
          {status.headline}
        </h3>
        <p id="offline-blocked-description" className="mt-2 text-sm text-muted-foreground">
          {status.blockedReason || status.message}
        </p>
        <ul className="mt-4 flex flex-col gap-1.5">
          {status.steps.map((step) => (
            <li key={step.id} className="flex items-center gap-2 text-sm text-muted-foreground">
              {step.status === "available" ? (
                <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
              ) : (
                <AlertTriangle aria-hidden="true" className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-500" />
              )}
              <span>
                {step.label}: {step.statusLabel}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            onClick={onRecheck}
          >
            Check connection again
          </button>
          {status.fix === "add-api-key" || status.fix === "wait-for-runtime" ? (
            <button
              type="button"
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90"
              onClick={onOpenSettings}
            >
              Open Settings
            </button>
          ) : (
            <button
              type="button"
              disabled={!localBackendAvailable}
              title={localBackendAvailable ? undefined : "Local-only mode needs the OpenScribe desktop app."}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={onSwitchToLocal}
            >
              <Cpu aria-hidden="true" className="h-4 w-4" />
              Switch to local-only
            </button>
          )}
          <button
            type="button"
            className="rounded-full px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={onDismiss}
          >
            Cancel
          </button>
        </div>
        {!localBackendAvailable && status.fix === "switch-to-local" && (
          <p className="mt-3 text-xs text-muted-foreground">
            Local-only mode is unavailable in the browser build. Reconnect to the internet to generate this note.
          </p>
        )}
        {onProceedAnyway && (
          <button
            type="button"
            className="mt-3 text-xs font-medium text-muted-foreground underline hover:text-foreground"
            onClick={onProceedAnyway}
          >
            Record the transcript anyway (the note will fail until you reconnect)
          </button>
        )}
      </div>
    </div>
  )
}
