import { app, BrowserWindow } from 'electron';
import path from 'path';
import { initDatabase } from './db/database';
import { registerIpcHandlers } from './ipc/handlers';
import { heartbeatService } from './services/heartbeat.service';

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

app.whenReady().then(async () => {
  try {
    await initDatabase();
    registerIpcHandlers(() => mainWindow);
    createWindow();
    heartbeatService.start(() => mainWindow, 10000); // Check every 10 seconds
  } catch (error) {
    console.error('Failed to start:', error);
    app.quit();
  }
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => { if (!mainWindow) createWindow(); });
