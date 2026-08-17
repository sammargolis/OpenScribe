"use client"

import { Settings } from "lucide-react"
import { Button } from "@ui/lib/ui/button"
import type { CapabilityStatus } from "@ui/lib/capability-status"
import { OfflineStatusIndicator } from "./offline-status-indicator"

interface SettingsBarProps {
  onOpenSettings: () => void
  /** Omit to render the bar without the offline readiness panel. */
  capabilityStatus?: CapabilityStatus
}

export function SettingsBar({ onOpenSettings, capabilityStatus }: SettingsBarProps) {
  return (
    <>
      {capabilityStatus && <OfflineStatusIndicator status={capabilityStatus} />}
      <div className="shrink-0 border-t border-sidebar-border bg-sidebar p-4">
        <Button
          variant="ghost"
          onClick={onOpenSettings}
          className="w-full justify-start gap-3 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
        >
          <Settings className="h-4 w-4" />
          <span>Settings</span>
        </Button>
      </div>
    </>
  )
}
