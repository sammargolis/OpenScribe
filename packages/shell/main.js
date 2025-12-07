const path = require('path');
const {
  app,
  BrowserWindow,
  shell,
  dialog,
  ipcMain,
  systemPreferences,
} = require('electron');
const { ensureNextServer, stopNextServer } = require('./next-server');

const isDev = !app.isPackaged;
const DEV_SERVER_URL = process.env.ELECTRON_START_URL || 'http://localhost:3000';
const isMac = process.platform === 'darwin';

let mainWindow;

const createMainWindow = async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#050505',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  window.on('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  try {
    if (isDev) {
      await window.loadURL(DEV_SERVER_URL);
      window.webContents.openDevTools({ mode: 'detach' });
    } else {
      const server = await ensureNextServer();
      await window.loadURL(server.url);
    }
  } catch (error) {
    dialog.showErrorBox(
      'Unable to open OpenScribe',
      error instanceof Error ? error.stack ?? error.message : String(error),
    );
    app.quit();
  }

  window.on('closed', () => {
    mainWindow = undefined;
  });

  return window;
};

const boot = async () => {
  await app.whenReady();
  registerPermissionHandlers();
  mainWindow = await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = await createMainWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
};

boot();

app.on('before-quit', () => {
  stopNextServer();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function registerPermissionHandlers() {
  ipcMain.handle('media-permissions:request', async () => {
    if (!isMac) {
      return { microphoneGranted: true, screenStatus: 'granted' };
    }
    let microphoneGranted = false;
    try {
      microphoneGranted = await systemPreferences.askForMediaAccess('microphone');
    } catch (error) {
      console.error('Microphone permission request failed', error);
    }
    const screenStatus = systemPreferences.getMediaAccessStatus('screen');
    return { microphoneGranted, screenStatus };
  });

  ipcMain.handle('media-permissions:status', (_event, mediaType) => {
    if (!isMac) return 'granted';
    try {
      return systemPreferences.getMediaAccessStatus(mediaType);
    } catch (error) {
      console.error('Failed to read media access status', error);
      return 'unknown';
    }
  });

  ipcMain.handle('media-permissions:open-screen-settings', () => {
    if (!isMac) return false;
    const settingsUrl = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
    shell.openExternal(settingsUrl).catch((error) => {
      console.error('Failed to open screen permissions panel', error);
    });
    return true;
  });
}
