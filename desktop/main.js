// Training desktop app (Linux): runs the Stretch Timer, Pilates Mat and Mobility web apps in their own window.
// The web files are bundled in ./web (copied from the repository root by scripts/copy-web.js) and served
// through an app:// scheme, because ES modules and localStorage do not work reliably from file:// pages.

const { app, BrowserWindow, Menu, protocol, net, shell, session, dialog } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");

const WEB_ROOT = path.join(__dirname, "web");
const HOST = "training";
const START_URL = `app://${HOST}/index.html`;

// Linux: Chromium's speech (voice cues) only works through speech-dispatcher when this is on.
app.commandLine.appendSwitch("enable-speech-dispatcher");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Only one window; a second launch focuses it.
if (!app.requestSingleInstanceLock()) app.quit();

function serveFiles() {
  protocol.handle("app", (request) => {
    const url = new URL(request.url);
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.normalize(path.join(WEB_ROOT, rel));
    if (url.host !== HOST || !file.startsWith(WEB_ROOT + path.sep)) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ---------- window size, full screen and scaling ----------
// The layout was designed for 1600 x 900 in landscape; larger windows (full screen on a big monitor)
// scale it up so text and buttons stay in proportion. Ctrl+= / Ctrl+- adjust on top of that.
const DESIGN = { width: 1600, height: 900 };
const stateFile = () => path.join(app.getPath("userData"), "window-state.json");
let userZoom = 1;

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return {};
  }
}

function saveState(win) {
  try {
    const state = { bounds: win.getNormalBounds(), maximized: win.isMaximized(), fullScreen: win.isFullScreen(), userZoom };
    fs.writeFileSync(stateFile(), JSON.stringify(state));
  } catch {
    // not saved; defaults next time
  }
}

function applyZoom(win) {
  const [w, h] = win.getContentSize();
  const auto = Math.max(1, Math.min(w / DESIGN.width, h / DESIGN.height));
  win.webContents.setZoomFactor(Math.round(auto * userZoom * 100) / 100);
}

function setUserZoom(win, value) {
  userZoom = Math.min(2, Math.max(0.6, Math.round(value * 10) / 10));
  applyZoom(win);
}

function createWindow() {
  const state = loadState();
  userZoom = Number.isFinite(state.userZoom) ? state.userZoom : 1;
  const b = state.bounds || {};
  const win = new BrowserWindow({
    width: b.width || 1280,
    height: b.height || 800,
    x: b.x,
    y: b.y,
    minWidth: 360,
    minHeight: 600,
    title: "Training",
    backgroundColor: "#141414",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
  if (state.maximized) win.maximize();
  if (state.fullScreen) win.setFullScreen(true);
  win.once("ready-to-show", () => win.show());

  for (const ev of ["resize", "enter-full-screen", "leave-full-screen", "maximize", "unmaximize"]) win.on(ev, () => applyZoom(win));
  win.webContents.on("did-finish-load", () => applyZoom(win));
  win.on("close", () => saveState(win));

  // Links to other sites open in the normal browser; the app stays on its own pages.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith("app://")) shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://")) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
  win.loadURL(START_URL);
  return win;
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  // Switching from the menu asks first if a workout is running, as the in-app switcher does.
  const go = (page) => async () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    const busy = await win.webContents.executeJavaScript(
      "(() => { const a = window.stretchTimer || window.pilatesApp || window.mobilityApp; return Boolean(a && a.isActive && a.isActive()); })()",
    ).catch(() => false);
    if (busy && dialog.showMessageBoxSync(win, { type: "question", buttons: ["Switch", "Cancel"], defaultId: 1, cancelId: 1,
      message: "Leave this workout and switch app?" }) !== 0) return;
    win.loadURL(`app://${HOST}/${page}`);
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: "appMenu" }] : []),
    { label: "Apps", submenu: [
      { label: "All apps", accelerator: "CmdOrCtrl+0", click: go("index.html") },
      { type: "separator" },
      { label: "Stretch Timer", accelerator: "CmdOrCtrl+1", click: go("timer.html") },
      { label: "Pilates Mat", accelerator: "CmdOrCtrl+2", click: go("pilates/") },
      { label: "Mobility", accelerator: "CmdOrCtrl+3", click: go("mobility/") },
      ...(isMac ? [] : [{ type: "separator" }, { role: "quit" }]),
    ] },
    { role: "editMenu" },
    { label: "View", submenu: [
      { label: "Full Screen", accelerator: "F11", click: (_i, win) => win && win.setFullScreen(!win.isFullScreen()) },
      { label: "Exit Full Screen", accelerator: "Shift+Escape", click: (_i, win) => win && win.setFullScreen(false) },
      { type: "separator" },
      { label: "Larger", accelerator: "CmdOrCtrl+=", click: (_i, win) => win && setUserZoom(win, userZoom + 0.1) },
      { label: "Larger", accelerator: "CmdOrCtrl+Plus", visible: false, click: (_i, win) => win && setUserZoom(win, userZoom + 0.1) },
      { label: "Smaller", accelerator: "CmdOrCtrl+-", click: (_i, win) => win && setUserZoom(win, userZoom - 0.1) },
      { label: "Normal size", click: (_i, win) => win && setUserZoom(win, 1) },
      { type: "separator" },
      { role: "reload" },
      ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }]),
    ] },
    { role: "windowMenu" },
  ]));
}

app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  serveFiles();
  // Keep the screen awake while a workout runs (the apps request it).
  session.defaultSession.setPermissionRequestHandler((_wc, permission, done) => done(permission === "screen-wake-lock"));
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
