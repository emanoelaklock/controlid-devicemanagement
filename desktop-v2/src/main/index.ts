import { app, BrowserWindow } from 'electron';
import path from 'path';
import { initDatabase } from './db/database';
import { registerIpcHandlers } from './ipc/handlers';
import { heartbeatService } from './services/heartbeat.service';
import { schedulerService } from './services/scheduler.service';

// Control iD devices use self-signed SSL certificates.
// Without this, all HTTPS requests to devices will fail with CERT errors.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Control iD Device Manager',
    backgroundColor: '#0f172a', // slate-900
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    },
    autoHideMenuBar: true,
    show: false,
  });

  // Show when ready to prevent white flash
  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  mainWindow.on('closed', () => { mainWindow = null; });
}

function setupAutoUpdater(): void {
  // Auto-update via GitHub Releases (only meaningful in the packaged .exe).
  // Requires the "publish" config in package.json and published releases.
  if (!app.isPackaged) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-downloaded', (info: any) => {
      const { dialog } = require('electron');
      if (!mainWindow || mainWindow.isDestroyed()) return;
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update available',
        message: `Version ${info.version} has been downloaded. Restart to install?`,
        buttons: ['Later', 'Restart now'],
        defaultId: 1,
      }).then((r: any) => { if (r.response === 1) autoUpdater.quitAndInstall(); });
    });

    autoUpdater.on('error', (err: Error) => console.warn('[AutoUpdate]', err.message));
    autoUpdater.checkForUpdates().catch((err: Error) => console.warn('[AutoUpdate]', err.message));
    // Re-check every 4 hours while the app is open
    setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 4 * 60 * 60 * 1000);
  } catch (err) {
    console.warn('[AutoUpdate] electron-updater not available:', err);
  }
}

app.whenReady().then(async () => {
  try {
    await initDatabase();
    registerIpcHandlers(() => mainWindow);
    createWindow();
    heartbeatService.start(() => mainWindow, 5000); // Check every 5 seconds
    schedulerService.start(() => mainWindow); // Daily scheduled config backup
    setupAutoUpdater();
  } catch (error) {
    console.error('Failed to start:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!mainWindow) createWindow(); });
