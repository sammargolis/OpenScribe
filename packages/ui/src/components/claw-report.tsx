"use client"

import { AlertTriangle, Ban, FlaskConical, Lightbulb, X } from "lucide-react"
import { Button } from "@ui/lib/ui/button"
import type { BlockedClawAction, ClawAction, ClawReport } from "@openclaw"

interface ClawReportPanelProps {
  report: ClawReport
  onDismiss: () => void
}

const MODE_LABELS: Record<ClawReport["mode"], string> = {
  off: "Off",
  suggest_only: "Suggest Only",
  tiny_actions_only: "Tiny Actions Only",
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`
}

function describePayload(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload)
  if (entries.length === 0) return "no payload"
  return entries
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join(" · ")
}

function ActionRow({ action, note }: { action: ClawAction; note?: string }) {
  return (
    <li className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center justify-between gap-2">
        <code className="text-xs font-semibold text-foreground">{action.type}</code>
        <span className="text-xs text-muted-foreground">confidence {formatConfidence(action.confidence)}</span>
      </div>
      <p className="mt-1 text-sm text-foreground">{describePayload(action.payload)}</p>
      <p className="mt-1 text-xs text-muted-foreground">Why: {action.reason}</p>
      {note && <p className="mt-1 text-xs text-muted-foreground italic">{note}</p>}
    </li>
  )
}

function BlockedRow({ entry }: { entry: BlockedClawAction }) {
  return (
    <li className="rounded-lg border border-dashed border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <code className="text-xs font-semibold text-muted-foreground line-through">{entry.action.type}</code>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {entry.reasonCode}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{entry.reason}</p>
    </li>
  )
}

/**
 * Claw Report — the read-only output of the experimental OpenClaw POC.
 * Shows proposed actions, what executed, and what was blocked and why.
 */
export function ClawReportPanel({ report, onDismiss }: ClawReportPanelProps) {
  // Actions held back purely by the mode gate are genuine suggestions: they
  // passed the allowlist, the payload contract and the confidence threshold.
  const suggestions = report.blocked.filter(
    (entry) => entry.reasonCode === "mode_suggest_only" || entry.reasonCode === "mode_off",
  )
  const refused = report.blocked.filter(
    (entry) => entry.reasonCode !== "mode_suggest_only" && entry.reasonCode !== "mode_off",
  )

  return (
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 shrink-0 text-amber-600" />
          <h3 className="text-sm font-semibold text-foreground">
            Claw Report <span className="font-normal text-muted-foreground">· {MODE_LABELS[report.mode]}</span>
          </h3>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss Claw Report</span>
        </Button>
      </div>

      <p className="mt-2 flex items-start gap-2 text-xs font-medium text-amber-700 dark:text-amber-500">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>{report.disclaimer}</span>
      </p>

      {report.plannerError && (
        <p className="mt-3 rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
          The OpenClaw planner did not return a usable plan, so no actions were suggested. The clinical
          note is unaffected. ({report.plannerError})
        </p>
      )}

      {report.executed.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Lightbulb className="h-3.5 w-3.5" /> Executed locally ({report.executed.length})
          </p>
          <ul className="space-y-2">
            {report.executed.map((entry) => (
              <ActionRow key={entry.record.id} action={entry.action} note="Written to the local list only." />
            ))}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Suggested, not executed ({suggestions.length})
          </p>
          <ul className="space-y-2">
            {suggestions.map((entry, index) => (
              <ActionRow
                key={`${entry.action.type}-${index}`}
                action={entry.action}
                note={entry.reason}
              />
            ))}
          </ul>
        </div>
      )}

      {refused.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <Ban className="h-3.5 w-3.5" /> Blocked ({refused.length})
          </p>
          <ul className="space-y-2">
            {refused.map((entry, index) => (
              <BlockedRow key={`${entry.action.type}-${entry.reasonCode}-${index}`} entry={entry} />
            ))}
          </ul>
        </div>
      )}

      {report.invalid.length > 0 && (
        <p className="mt-3 text-xs text-muted-foreground">
          {report.invalid.length} planner {report.invalid.length === 1 ? "item was" : "items were"} discarded
          for failing schema validation.
        </p>
      )}

      {report.proposed.length === 0 && report.blocked.length === 0 && !report.plannerError && (
        <p className="mt-3 text-xs text-muted-foreground">
          OpenClaw did not suggest any follow-up actions for this note.
        </p>
      )}
    </section>
  )
}
