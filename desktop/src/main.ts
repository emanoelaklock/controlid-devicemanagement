import { app, BrowserWindow, dialog } from 'electron';
import path from 'path';
import { startServer } from './server';

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
    await startServer(PORT);
    createWindow();
  } catch (error) {
    dialog.showErrorBox(
      'Startup Error',
      `Failed to start the application server:\n${error instanceof Error ? error.message : String(error)}`
    );
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
