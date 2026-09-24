const { app, BrowserWindow, shell, Menu, nativeImage, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

// Ruta fija de datos (cookies/sesión) aunque el .exe sea portable
const USER_DATA = path.join(app.getPath("appData"), "Backstage Agencia");
try {
  fs.mkdirSync(USER_DATA, { recursive: true });
  app.setPath("userData", USER_DATA);
} catch {
  /* ignore */
}

const RESUME_FILE = path.join(USER_DATA, "session-resume.json");
const SESSION_DAYS = 30;

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

function loadCacheInject() {
  const p = path.join(__dirname, "cache-inject.js");
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
}

function injectCache(wc) {
  const code = loadCacheInject();
  if (!code) return;
  wc.executeJavaScript(code, true).catch(() => {});
}

function readResume() {
  try {
    const data = JSON.parse(fs.readFileSync(RESUME_FILE, "utf8"));
    if (data && typeof data.agency === "string" && data.agency) return data;
  } catch {
    /* ignore */
  }
  return null;
}

function writeResume(patch) {
  try {
    const prev = readResume() || {};
    const next = { ...prev, ...patch, updatedAt: Date.now() };
    fs.writeFileSync(RESUME_FILE, JSON.stringify(next), "utf8");
  } catch {
    /* ignore */
  }
}

function rememberFromUrl(url) {
  try {
    const u = new URL(url);
    const m = u.pathname.match(/^\/a\/([^/]+)(\/.*)?$/);
    if (!m) return;
    const agency = m[1];
    const rest = m[2] || "";
    if (rest === "/login" || rest.startsWith("/login/")) {
      writeResume({ agency });
      return;
    }
    if (rest && rest !== "/") {
      writeResume({ agency, loggedIn: true });
    }
  } catch {
    /* ignore */
  }
}

function isSessionCookieName(name) {
  return (
    name === "next-auth.session-token" ||
    name === "__Secure-next-auth.session-token" ||
    name === "__Host-next-auth.session-token"
  );
}

function mapSameSite(value) {
  if (value === "no_restriction" || value === "lax" || value === "strict") {
    return value;
  }
  if (value === true || value === "None" || value === "none") {
    return "no_restriction";
  }
  if (value === "Strict" || value === "strict") return "strict";
  return "lax";
}

async function hardenSessionCookies(ses, origin) {
  try {
    const cookies = await ses.cookies.get({ url: origin });
    const expirationDate =
      Math.floor(Date.now() / 1000) + SESSION_DAYS * 24 * 60 * 60;
    for (const c of cookies) {
      if (!isSessionCookieName(c.name)) continue;
      const details = {
        url: origin,
        name: c.name,
        value: c.value,
        path: c.path || "/",
        secure: !!c.secure || origin.startsWith("https"),
        httpOnly: c.httpOnly !== false,
        sameSite: mapSameSite(c.sameSite),
        expirationDate,
      };
      if (c.domain) details.domain = c.domain;
      await ses.cookies.set(details);
    }
    await ses.cookies.flushStore();
  } catch {
    /* ignore */
  }
}

async function hasAuthSession(ses, origin) {
  try {
    const cookies = await ses.cookies.get({ url: origin });
    return cookies.some((c) => isSessionCookieName(c.name) && c.value);
  } catch {
    return false;
  }
}

async function resolveStartUrl(cfg, ses) {
  const base = cfg.useDev ? cfg.devUrl : cfg.url;
  let origin;
  try {
    origin = new URL(base).origin;
  } catch {
    return base;
  }

  await hardenSessionCookies(ses, origin);

  const resume = readResume();
  const loggedIn = await hasAuthSession(ses, origin);

  if (loggedIn && resume?.agency) {
    return `${origin}/a/${resume.agency}/dashboard`;
  }
  if (resume?.agency) {
    return `${origin}/a/${resume.agency}/login`;
  }
  return base;
}

function createWindow() {
  const cfg = loadConfig();
  const icon = resolveIcon();

  const ses = session.fromPartition("persist:agencia");
  try {
    ses.setUserAgent(ses.getUserAgent() + " BackstageAgenciaDesktop/1.3");
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
      v8CacheOptions: "code",
    },
  });

  if (process.platform === "win32" && icon) {
    win.setIcon(icon);
  }

  Menu.setApplicationMenu(null);

  win.once("ready-to-show", () => win.show());

  const wc = win.webContents;
  wc.on("dom-ready", () => injectCache(wc));
  wc.on("did-finish-load", () => injectCache(wc));
  wc.on("did-navigate-in-page", (_e, url) => {
    rememberFromUrl(url);
    injectCache(wc);
  });
  wc.on("did-navigate", (_e, url) => {
    rememberFromUrl(url);
    const origin = (() => {
      try {
        return new URL(url).origin;
      } catch {
        return null;
      }
    })();
    if (origin) hardenSessionCookies(ses, origin);
  });

  // Refuerza cookies cada minuto mientras la app esté abierta
  const cookieTimer = setInterval(() => {
    const cfgNow = loadConfig();
    const base = cfgNow.useDev ? cfgNow.devUrl : cfgNow.url;
    try {
      hardenSessionCookies(ses, new URL(base).origin);
    } catch {
      /* ignore */
    }
  }, 60 * 1000);
  win.on("closed", () => clearInterval(cookieTimer));

  wc.setWindowOpenHandler(({ url }) => {
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

  resolveStartUrl(cfg, ses)
    .then((startUrl) => {
      try {
        const origin = new URL(startUrl).origin;
        ses.preconnect({ url: origin, numSockets: 4 });
      } catch {
        /* ignore */
      }
      return win.loadURL(startUrl);
    })
    .catch((err) => {
      const fallback = cfg.useDev ? cfg.devUrl : cfg.url;
      win.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
          `<!DOCTYPE html><html><body style="font-family:Segoe UI;background:#0f1115;color:#e8ecf4;padding:40px">
        <h1>No se pudo abrir el panel</h1>
        <p>URL: <code>${fallback}</code></p>
        <p>${String(err?.message || err)}</p>
        </body></html>`
        )}`
      );
    });
}

app.commandLine.appendSwitch("disk-cache-size", String(768 * 1024 * 1024));
app.commandLine.appendSwitch("enable-gpu-rasterization");
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

let quitting = false;
app.on("before-quit", (e) => {
  if (quitting) return;
  e.preventDefault();
  quitting = true;
  const cfg = loadConfig();
  const base = cfg.useDev ? cfg.devUrl : cfg.url;
  const ses = session.fromPartition("persist:agencia");
  let origin = base;
  try {
    origin = new URL(base).origin;
  } catch {
    /* ignore */
  }
  hardenSessionCookies(ses, origin)
    .catch(() => {})
    .finally(() => {
      app.exit(0);
    });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
