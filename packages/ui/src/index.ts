export { EncounterList } from "./components/encounter-list"
export { IdleView } from "./components/idle-view"
export { NewEncounterForm } from "./components/new-encounter-form"
export { RecordingView } from "./components/recording-view"
export { ProcessingView } from "./components/processing-view"
export { ErrorBoundary } from "./components/error-boundary"
export { PermissionsDialog } from "./components/permissions-dialog"
export { SettingsDialog } from "./components/settings-dialog"
export { SettingsBar } from "./components/settings-bar"
export { ModelIndicator } from "./components/model-indicator"
export { LocalSetupWizard } from "./components/local-setup-wizard"
export { OfflineStatusIndicator, OfflineBlockedDialog } from "./components/offline-status-indicator"
export { ClawReportPanel } from "./components/claw-report"
export { useEncounters } from "./hooks/use-encounters"
export { useHttpsWarning } from "./hooks/use-https-warning"
export { useOnlineStatus, type OnlineStatus } from "./hooks/use-online-status"
export {
  resolveCapabilityStatus,
  type CapabilityStatus,
  type CapabilityStep,
  type CapabilityFix,
} from "./lib/capability-status"
