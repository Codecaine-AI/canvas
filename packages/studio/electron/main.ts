import { createReadStream } from "node:fs";
import { mkdir, stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, resolve, sep } from "node:path";
import {
  app,
  BrowserWindow,
  Menu,
  shell,
  type MenuItemConstructorOptions,
} from "electron";
import { createCanvasFileApiHandler } from "../server/canvas-file-api";

app.setName("Canvas");

const HOST = "127.0.0.1";

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".otf": "font/otf",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

let mainWindow: BrowserWindow | null = null;
let studioServer: ReturnType<typeof createServer> | null = null;

function resolveCanvasesDir(): string {
  if (process.env.CANVAS_DIR) {
    return resolve(process.env.CANVAS_DIR);
  }

  if (!app.isPackaged) {
    return resolve(__dirname, "../../..", "canvases");
  }

  return resolve(app.getPath("userData"), "canvases");
}

function sendPlainText(
  res: ServerResponse,
  statusCode: number,
  message: string,
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.end(`${message}\n`);
}

async function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  distDir: string,
): Promise<void> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    sendPlainText(res, 405, "Method not allowed.");
    return;
  }

  let pathname: string;
  try {
    const url = new URL(req.url ?? "/", `http://${HOST}`);
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendPlainText(res, 400, "Bad request.");
    return;
  }

  const relativePath = pathname === "/" || extname(pathname) === ""
    ? "index.html"
    : pathname.replace(/^\/+/, "");
  const filePath = resolve(distDir, relativePath);
  const confinedRoot = distDir.endsWith(sep) ? distDir : `${distDir}${sep}`;

  if (!filePath.startsWith(confinedRoot)) {
    sendPlainText(res, 404, "Not found.");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      sendPlainText(res, 404, "Not found.");
      return;
    }

    res.statusCode = 200;
    res.setHeader(
      "content-type",
      CONTENT_TYPES[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    );
    res.setHeader("content-length", fileStat.size);

    if (req.method === "HEAD") {
      res.end();
      return;
    }

    const stream = createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        sendPlainText(res, 500, "Internal server error.");
      } else {
        res.destroy();
      }
    });
    stream.pipe(res);
  } catch {
    sendPlainText(res, 404, "Not found.");
  }
}

async function startStudioServer(canvasesDir: string): Promise<string> {
  const distDir = resolve(__dirname, "../dist");
  const canvasFileApiHandler = createCanvasFileApiHandler({ canvasesDir });

  studioServer = createServer((req, res) => {
    canvasFileApiHandler(req, res, () => {
      void serveStaticFile(req, res, distDir).catch(() => {
        if (!res.headersSent) {
          sendPlainText(res, 500, "Internal server error.");
        } else {
          res.destroy();
        }
      });
    });
  });

  await new Promise<void>((resolveListening, reject) => {
    studioServer?.once("error", reject);
    studioServer?.listen(0, HOST, () => resolveListening());
  });

  const address = studioServer.address() as AddressInfo;
  return `http://${HOST}:${address.port}`;
}

function installApplicationMenu(): void {
  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" },
        { type: "separator" },
        { role: "close" },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function openStudioWindow(studioUrl: string): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const protocol = new URL(url).protocol;
      if (protocol === "http:" || protocol === "https:") {
        void shell.openExternal(url).catch((error: unknown) => {
          console.error("Failed to open external URL:", error);
        });
      }
    } catch {
      // Malformed URLs are denied along with all non-http(s) popups.
    }

    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(studioUrl);
}

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  studioServer?.close();
  studioServer = null;
});

void app.whenReady().then(async () => {
  const canvasesDir = resolveCanvasesDir();
  await mkdir(canvasesDir, { recursive: true });
  const studioUrl = await startStudioServer(canvasesDir);
  console.log(`studio ready at ${studioUrl}`);
  installApplicationMenu();
  openStudioWindow(studioUrl);
}).catch((error: unknown) => {
  console.error("Failed to start studio:", error);
  app.quit();
});
