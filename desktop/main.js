// Training desktop app: runs the Stretch Timer, Pilates Mat and Mobility web apps in their own window.
// The web files are bundled in ./web (copied from the repository root by scripts/copy-web.js) and served
// through an app:// scheme, because ES modules and localStorage do not work reliably from file:// pages.

const { app, BrowserWindow, Menu, protocol, net, shell, session, dialog } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const WEB_ROOT = path.join(__dirname, "web");
const HOST = "training";
const START_URL = `app://${HOST}/index.html`;

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

function createWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 900,
    minWidth: 360,
    minHeight: 640,
    title: "Training",
    backgroundColor: "#141414",
    icon: path.join(__dirname, "build", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false },
  });
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
      { role: "reload" }, { role: "togglefullscreen" }, { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" },
      ...(app.isPackaged ? [] : [{ type: "separator" }, { role: "toggleDevTools" }]),
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
