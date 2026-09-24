const { app, BrowserWindow, shell, Menu, nativeImage, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

function appRoot() {
  if (app.isPackaged) return app.getAppPath();
  return path.join(__dirname, "..");
}

function resolveIcon() {
  const candidates = [
    path.join(appRoot(), "build", "icon.ico"),
    path.join(appRoot(), "build", "icon.png"),
    path.join(__dirname, "..", "build", "icon.ico"),
    path.join(__dirname, "..", "build", "icon.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  }
  return undefined;
}

function loadConfig() {
  const defaults = {
    url: "https://agencia-datos.vercel.app",
    devUrl: "http://127.0.0.1:3000",
    useDev: false,
  };
  const candidates = [
    path.join(process.resourcesPath || "", "config.json"),
    path.join(appRoot(), "config.json"),
    path.join(__dirname, "..", "config.json"),
  ];
  for (const configPath of candidates) {
    try {
      if (!configPath || !fs.existsSync(configPath)) continue;
      const raw = fs.readFileSync(configPath, "utf8");
      return { ...defaults, ...JSON.parse(raw) };
    } catch {
      /* try next */
    }
  }
  return defaults;
}

function createWindow() {
  const cfg = loadConfig();
  const startUrl = cfg.useDev ? cfg.devUrl : cfg.url;
  const icon = resolveIcon();

  // Partition persistente = cookies + localStorage + caché HTTP en disco
  const ses = session.fromPartition("persist:agencia");
  try {
    ses.setUserAgent(ses.getUserAgent() + " BackstageAgenciaDesktop/1.0");
  } catch {
    /* ignore */
  }

  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0f1115",
    title: "Backstage Agencia",
    autoHideMenuBar: true,
    show: false,
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      session: ses,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  if (process.platform === "win32" && icon) {
    win.setIcon(icon);
  }

  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => win.show());

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      const allowed = [cfg.url, cfg.devUrl].some((base) => {
        try {
          return u.origin === new URL(base).origin;
        } catch {
          return false;
        }
      });
      if (!allowed) {
        shell.openExternal(url);
        return { action: "deny" };
      }
    } catch {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  win.loadURL(startUrl).catch((err) => {
    win.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        `<!DOCTYPE html><html><body style="font-family:Segoe UI;background:#0f1115;color:#e8ecf4;padding:40px">
        <h1>No se pudo abrir el panel</h1>
        <p>URL: <code>${startUrl}</code></p>
        <p>${String(err?.message || err)}</p>
        </body></html>`
      )}`
    );
  });
}

app.commandLine.appendSwitch("disk-cache-size", String(512 * 1024 * 1024));
app.setName("Backstage Agencia");

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.backstage.agencia");
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
