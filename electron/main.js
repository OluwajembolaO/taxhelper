// Electron main process for the desktop build. ESM, because package.json is
// `"type": "module"` — under which a CJS `require('electron')` resolves to the
// npm path shim rather than the built-in API.
//
// The renderer is the SAME app as the web build, served over a custom `app://`
// scheme rather than file://. That matters for more than tidiness: file:// is
// an opaque origin, so IndexedDB and localStorage are unreliable or wiped
// between runs — the entire work log lives in IndexedDB, making a stable
// origin a correctness requirement, not a preference.
//
// Security mirrors the web build: no Node in the renderer, context isolation
// on, sandboxed, navigation away from the app refused, and external links
// handed to the real browser rather than opened in a window with no URL bar.

// Electron's ESM entry exposes the API as a DEFAULT export; named imports
// throw "does not provide an export named ...".
import electron from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const { app, BrowserWindow, shell, protocol, net } = electron;

const dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(dirname, '..', 'dist');
const APP_ORIGIN = 'app://taxhelper';

// Must run before `ready`. `standard` gives the scheme real URL semantics so it
// can host an origin; `secure` makes it a secure context, so service workers,
// crypto.subtle and friends behave exactly as they do over HTTPS.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

/** Resolve a URL path inside dist/, refusing anything that escapes it. */
function resolveRequestPath(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const resolved = path.join(DIST, clean === '/' ? 'index.html' : clean);
  return resolved.startsWith(DIST) ? resolved : null;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 380,
    minHeight: 560,
    backgroundColor: '#f6f3ea',
    title: 'TaxHelper',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  win.loadURL(`${APP_ORIGIN}/index.html`);

  // Supabase password-reset mails can produce outbound links; those belong in
  // the user's browser, never inside an app window with no address bar.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      if (url.startsWith('https://')) shell.openExternal(url);
    }
  });

  return win;
}

// One instance only, so two windows can never write the same IndexedDB.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    protocol.handle('app', async (request) => {
      const file = resolveRequestPath(new URL(request.url).pathname);
      if (!file) return new Response('Forbidden', { status: 403 });
      try {
        return await net.fetch(pathToFileURL(file).toString());
      } catch {
        // Unknown path: serve the SPA document so client-side routing works.
        return net.fetch(pathToFileURL(path.join(DIST, 'index.html')).toString());
      }
    });

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
