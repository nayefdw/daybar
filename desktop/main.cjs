'use strict';
const { app, BrowserWindow, Menu, Tray, dialog, shell, session, globalShortcut, screen } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { readSettings, writeSettings, isAppURL, externalURL, choosePort, serverEnvironment, waitForServer, stopServer } = require('./runtime.cjs');

app.setName('Daybar');
app.setAppUserModelId('com.nayefdw.daybar');
app.setPath('userData', process.env.DAYBAR_USER_DATA || path.join(app.getPath('appData'), 'Daybar'));
const profile = app.getPath('userData');
const settingsFile = path.join(profile, 'desktop.json');
const dataDir = path.join(profile, 'data');
const logFile = path.join(profile, 'desktop.log');
const settings = readSettings(settingsFile);
let mainWindow, tray, server, origin, ready = false, quitting = false, shuttingDown = false;
let logBytes = 0;

function log(message) {
  try {
    const text = `${new Date().toISOString()} ${String(message).trimEnd()}\n`;
    if (logBytes + Buffer.byteLength(text) > 2 * 1024 * 1024) {
      fs.copyFileSync(logFile, logFile + '.previous');
      fs.writeFileSync(logFile, '');
      logBytes = 0;
    }
    fs.appendFileSync(logFile, text);
    logBytes += Buffer.byteLength(text);
  } catch { /* a full disk must not crash the desktop shell */ }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function saveBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  settings.bounds = mainWindow.getNormalBounds();
  settings.maximized = mainWindow.isMaximized();
  try { writeSettings(settingsFile, settings); } catch (error) { log(error); }
}

async function openExternal(value) {
  const url = externalURL(value);
  if (url) await shell.openExternal(url).catch(log);
}

function menus() {
  const openData = () => void shell.openPath(dataDir).then(error => { if (error) log(error); });
  const quit = () => app.quit();
  const startup = {
    label: 'Start Daybar when I sign in to Windows', type: 'checkbox',
    checked: app.getLoginItemSettings().openAtLogin,
    click: item => app.setLoginItemSettings({ openAtLogin: item.checked, path: process.execPath }),
  };
  const about = () => void dialog.showMessageBox(mainWindow, {
    type: 'info', title: 'About Daybar', message: `Daybar ${app.getVersion()}`,
    detail: 'Your tasks, events, habits and notes, on this computer.\n\nBased on flowplan by Yannic Schuller and contributors.\nLicensed under AGPL-3.0-only.\n\nClose the window to keep Daybar in the tray. Use File → Quit to stop it.',
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '&File', submenu: [
      { label: 'Show Daybar', accelerator: 'CommandOrControl+Shift+D', click: showWindow },
      { label: 'Hide to tray', accelerator: 'CommandOrControl+W', click: () => mainWindow.hide() },
      { type: 'separator' }, { label: 'Open data folder', click: openData },
      startup, { type: 'separator' }, { label: 'Quit', accelerator: 'CommandOrControl+Q', click: quit },
    ] },
    { label: '&Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '&View', submenu: [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    { label: '&Help', submenu: [
      { label: 'Windows guide', click: () => openExternal('https://github.com/nayefdw/daybar/blob/codex/windows-desktop/docs/daybar/windows.md') },
      { label: 'Source code', click: () => openExternal('https://github.com/nayefdw/daybar/tree/codex/windows-desktop') },
      { label: 'Open diagnostics folder', click: () => shell.openPath(profile) },
      { type: 'separator' }, { label: 'About Daybar', click: about },
    ] },
  ]));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Daybar', click: showWindow },
    { ...startup },
    { label: 'Open data folder', click: openData },
    { type: 'separator' }, { label: 'Quit Daybar', click: quit },
  ]));
}

function createWindow() {
  const bounds = settings.bounds;
  const visible = bounds && [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) && screen.getAllDisplays().some(({ workArea: area }) =>
    bounds.x + bounds.width > area.x + 80 && bounds.x < area.x + area.width - 80 && bounds.y + bounds.height > area.y + 80 && bounds.y < area.y + area.height - 80);
  mainWindow = new BrowserWindow({
    title: 'Daybar', width: visible ? Math.max(900, Math.min(bounds.width, 3840)) : 1360,
    height: visible ? Math.max(640, Math.min(bounds.height, 2160)) : 900,
    ...(visible ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 900, minHeight: 640, show: false,
    backgroundColor: '#f8f8fb', icon: path.join(__dirname, 'assets/icon.ico'),
    webPreferences: {
      nodeIntegration: false, contextIsolation: true, sandbox: true,
      webSecurity: true, webviewTag: false, spellcheck: true,
      backgroundThrottling: true,
    },
  });
  mainWindow.once('ready-to-show', () => {
    if (settings.maximized) mainWindow.maximize();
    showWindow();
  });
  mainWindow.on('close', event => {
    saveBounds();
    if (!quitting && tray) { event.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppURL(url, origin)) void mainWindow.loadURL(url);
    else void openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAppURL(url, origin)) { event.preventDefault(); void openExternal(url); }
  });
  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isAppURL(url, origin)) { event.preventDefault(); void openExternal(url); }
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    log(`Renderer stopped: ${details.reason}`);
    if (ready && !quitting) void mainWindow.loadURL(origin);
  });
  return mainWindow.loadFile(path.join(__dirname, 'loading.html'));
}

function permissions() {
  const local = contents => contents === mainWindow?.webContents && isAppURL(contents.getURL(), origin);
  session.defaultSession.setPermissionCheckHandler((contents, permission, requestingOrigin) =>
    local(contents) && isAppURL(requestingOrigin, origin) && ['notifications', 'media', 'clipboard-sanitized-write'].includes(permission));
  session.defaultSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    if (!local(contents) || !isAppURL(details.requestingUrl || contents.getURL(), origin)) return callback(false);
    if (['notifications', 'clipboard-sanitized-write'].includes(permission)) return callback(true);
    if (permission !== 'media' || !details.mediaTypes?.length || details.mediaTypes.some(type => type !== 'audio')) return callback(false);
    void dialog.showMessageBox(mainWindow, {
      type: 'question', title: 'Microphone', message: 'Allow Daybar to record a voice note?',
      buttons: ['Allow microphone', 'Cancel'], defaultId: 1, cancelId: 1,
    }).then(({ response }) => callback(response === 0), () => callback(false));
  });
  session.defaultSession.on('will-download', (_event, item) => {
    item.setSaveDialogOptions({ title: 'Save Daybar export', defaultPath: path.join(app.getPath('downloads'), path.basename(item.getFilename())) });
    item.once('done', (_event, state) => {
      if (state !== 'completed' && state !== 'cancelled') void dialog.showMessageBox(mainWindow, { type: 'error', message: 'The download did not finish. Please try exporting again.' });
    });
  });
}

async function start() {
  fs.mkdirSync(dataDir, { recursive: true });
  logBytes = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
  log(`Starting Daybar desktop ${app.getVersion()}`);
  await createWindow();
  tray = new Tray(path.join(__dirname, 'assets/icon.ico'));
  tray.setToolTip('Daybar — your day, at a glance');
  tray.on('double-click', showWindow);
  menus();
  globalShortcut.register('CommandOrControl+Shift+D', showWindow);
  permissions();
  const bundle = app.isPackaged ? path.join(process.resourcesPath, 'bundle') : path.join(__dirname, 'bundle');
  const node = path.join(bundle, 'runtime/node.exe');
  if (!fs.existsSync(node) || !fs.existsSync(path.join(bundle, 'server/server.js'))) throw new Error('The desktop runtime is missing. Build with npm --prefix desktop run build first.');
  const port = await choosePort(settings.port);
  settings.port = port;
  writeSettings(settingsFile, settings);
  origin = `http://127.0.0.1:${port}`;
  const instance = randomBytes(24).toString('hex');
  server = spawn(node, [path.join(bundle, 'server-runner.cjs')], {
    cwd: path.join(bundle, 'server'), windowsHide: true,
    env: serverEnvironment(process.env, { port, dataDir, instance }),
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  server.stdout.on('data', log);
  server.stderr.on('data', log);
  server.on('error', log);
  server.on('exit', code => {
    log(`Server exited: ${code}`);
    if (ready && !quitting) {
      ready = false;
      void dialog.showMessageBox(mainWindow, { type: 'error', title: 'Daybar stopped', message: 'The local server stopped unexpectedly.', detail: `Your saved data remains in ${dataDir}. Quit and reopen Daybar. Diagnostics: ${logFile}` }).then(() => app.quit());
    }
  });
  await waitForServer(origin, instance, server);
  ready = true;
  await mainWindow.loadURL(origin);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.on('activate', showWindow);
  app.on('window-all-closed', () => { if (!tray) app.quit(); });
  app.on('before-quit', event => {
    if (shuttingDown) { event.preventDefault(); return; }
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    shuttingDown = true;
    saveBounds();
    globalShortcut.unregisterAll();
    tray?.destroy();
    tray = null;
    void stopServer(server).finally(() => { shuttingDown = false; app.quit(); });
  });
  app.whenReady().then(start).catch(async error => {
    log(error.stack || error);
    await dialog.showMessageBox({ type: 'error', title: 'Daybar could not start', message: error.message, detail: `Your data is kept in ${dataDir}.\nDiagnostics: ${logFile}` });
    app.quit();
  });
}
