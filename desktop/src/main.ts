import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';

// Log app paths for debugging
console.log('App paths:', {
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
  userData: app.getPath('userData'),
  exe: app.getPath('exe'),
});

let mainWindow: BrowserWindow | null = null;
const PORT = 3001;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 600,
    title: 'Control iD Device Manager',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    // Import server dynamically so database.ts env setup runs first
    const { startServer } = await import('./server');
    await startServer(PORT);
    createWindow();
  } catch (error) {
    const message = error instanceof Error
      ? `${error.message}\n\n${error.stack}`
      : String(error);
    console.error('Startup error:', message);
    dialog.showErrorBox('Startup Error', message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
