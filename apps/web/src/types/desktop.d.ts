export {}

type MediaAccessStatus = "not-determined" | "granted" | "denied" | "restricted" | "unknown"

declare global {
  interface DesktopScreenSource {
    id: string
    name: string
    displayId?: string
  }

  interface DesktopAPI {
    versions: NodeJS.ProcessVersions
    requestMediaPermissions?: () => Promise<{ microphoneGranted: boolean; screenStatus: MediaAccessStatus }>
    getMediaAccessStatus?: (mediaType: "microphone" | "camera" | "screen") => Promise<MediaAccessStatus>
    openScreenPermissionSettings?: () => Promise<boolean> | boolean
    getPrimaryScreenSource?: () => Promise<DesktopScreenSource | null>
  }

  interface Window {
    desktop?: DesktopAPI
    __openscribePermissionsPrimed?: boolean
  }
}
