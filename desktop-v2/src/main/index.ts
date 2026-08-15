import { app, BrowserWindow, Tray, Menu } from 'electron';
import path from 'path';
import { initDatabase, saveDb } from './db/database';
import { queryOne, run } from './db/queries';
import { registerIpcHandlers } from './ipc/handlers';
import { heartbeatService } from './services/heartbeat.service';
import { schedulerService } from './services/scheduler.service';

// Control iD devices use self-signed SSL certificates.
// Without this, all HTTPS requests to devices will fail with CERT errors.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;
let balloonShown = false;

// Passed by the "start with Windows" login item so the app boots straight to
// the tray without flashing a window.
const startHidden = process.argv.includes('--hidden');

// A hidden autostarted instance + a desktop-shortcut launch must not run two
// copies (two processes writing the same SQLite file). The second launch just
// pops the existing window. Dev skips the lock: it shares the userData name
// with the installed app, and the two must not block each other.
const gotLock = app.isPackaged ? app.requestSingleInstanceLock() : true;
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());
}

function showWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'Control iD Device Manager',
    backgroundColor: '#F3F4F8', // --sr-bg
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
    },
    autoHideMenuBar: true,
    show: false,
  });

  // Show when ready to prevent white flash — unless we booted to the tray.
  mainWindow.once('ready-to-show', () => { if (!startHidden) mainWindow?.show(); });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  }

  // Windows session end (logoff/shutdown): don't veto the close — flush the
  // DB and quit cleanly, or the OS shows "this app is preventing shutdown".
  mainWindow.on('session-end', () => {
    isQuitting = true;
    try { saveDb(); } catch { /* best effort */ }
    app.quit();
  });

  // Closing the window hides it to the tray so the heartbeat keeps recording
  // connection history. Quit via the tray menu (or OS shutdown). If the tray
  // icon failed to create, fall through to a normal close — a hidden window
  // with no tray would leave an unreachable process.
  mainWindow.on('close', (e) => {
    if (isQuitting || !tray) return;
    e.preventDefault();
    mainWindow?.hide();
    if (!balloonShown && tray) {
      balloonShown = true;
      try {
        tray.displayBalloon({
          title: 'Still monitoring',
          content: 'Device Manager keeps running in the tray — the heartbeat stays active. Right-click the tray icon to quit.',
          iconType: 'info',
        });
      } catch { /* balloons unsupported — fine */ }
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray(): void {
  try {
    tray = new Tray(path.join(app.getAppPath(), 'assets', 'icon.ico'));
  } catch (err) {
    console.warn('[Tray] Could not create tray icon:', err);
    return;
  }
  tray.setToolTip('Control iD Device Manager — monitoring');

  const buildMenu = () => Menu.buildFromTemplate([
    { label: 'Open Device Manager', click: showWindow },
    { type: 'separator' },
    {
      label: 'Start with Windows',
      type: 'checkbox',
      enabled: app.isPackaged, // in dev this would register the bare electron binary
      checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
      click: (item) => {
        app.setLoginItemSettings({ openAtLogin: item.checked, args: ['--hidden'] });
        tray?.setContextMenu(buildMenu());
      },
    },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]);
  tray.setContextMenu(buildMenu());
  tray.on('click', showWindow);
  tray.on('double-click', showWindow);
}

/** First packaged run: register the login item (hidden start) by default, so
 *  monitoring survives reboots without the user having to remember it. The
 *  tray checkbox can turn it off; we only force it once. */
function setupAutostartDefault(): void {
  if (!app.isPackaged) return;
  const configured = queryOne(`SELECT value FROM app_settings WHERE key = 'tray_autostart_configured'`);
  if (configured) return;
  app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
  run(`INSERT OR REPLACE INTO app_settings (key, value) VALUES ('tray_autostart_configured', '1')`);
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
      }).then((r: any) => { if (r.response === 1) { isQuitting = true; autoUpdater.quitAndInstall(); } });
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
  if (!gotLock) return;
  try {
    await initDatabase();
    setupAutostartDefault();
    registerIpcHandlers(() => mainWindow);
    createTray();
    createWindow();
    heartbeatService.start(() => mainWindow, 5000); // Check every 5 seconds
    schedulerService.start(() => mainWindow); // Daily scheduled config backup
    setupAutoUpdater();
  } catch (error) {
    console.error('Failed to start:', error);
    app.quit();
  }
});

app.on('before-quit', () => { isQuitting = true; });

// The app lives in the tray — closing the window must NOT end the process,
// or the heartbeat (and connection history) would stop with it. Without a
// tray icon there is no way back, so quit normally in that case.
app.on('window-all-closed', () => { if (isQuitting || !tray) app.quit(); });
app.on('activate', () => { if (!mainWindow) createWindow(); });
