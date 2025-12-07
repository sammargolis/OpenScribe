const { contextBridge, desktopCapturer, ipcRenderer } = require('electron');

async function getPrimaryScreenSource() {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    });
    if (!sources.length) {
      return null;
    }
    const primarySource =
      sources.find((source) => source.display_id === '0') ||
      sources.find((source) => /screen 1/i.test(source.name)) ||
      sources[0];
    return primarySource
      ? { id: primarySource.id, name: primarySource.name, displayId: primarySource.display_id }
      : null;
  } catch (error) {
    console.error('Failed to enumerate screens', error);
    return null;
  }
}

contextBridge.exposeInMainWorld('desktop', {
  versions: process.versions,
  requestMediaPermissions: () => ipcRenderer.invoke('media-permissions:request'),
  getMediaAccessStatus: (mediaType) => ipcRenderer.invoke('media-permissions:status', mediaType),
  openScreenPermissionSettings: () => ipcRenderer.invoke('media-permissions:open-screen-settings'),
  getPrimaryScreenSource,
});
