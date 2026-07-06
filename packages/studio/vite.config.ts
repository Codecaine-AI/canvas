import { createReadStream, promises as fs, existsSync } from "node:fs";
import { basename, resolve, sep } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { validateInteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

const CANVAS_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const JSON_LIMIT_BYTES = 5 * 1024 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sendJson(
  res: import("node:http").ServerResponse,
  statusCode: number,
  payload: unknown,
) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload)}\n`);
}

function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > JSON_LIMIT_BYTES) {
        reject(new Error("JSON body exceeds 5 MB."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolveBody(raw ? JSON.parse(raw) : null);
      } catch {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

function filePathForId(canvasesDir: string, id: string): string | null {
  if (!CANVAS_ID_PATTERN.test(id)) return null;
  const filePath = resolve(canvasesDir, `${id}.canvas.json`);
  const confinedRoot = canvasesDir.endsWith(sep) ? canvasesDir : `${canvasesDir}${sep}`;
  return filePath.startsWith(confinedRoot) ? filePath : null;
}

function canvasFileApiPlugin(): Plugin {
  const canvasesDir = resolve(__dirname, "../..", "canvases");

  return {
    name: "studio-canvas-file-api",
    configureServer(server) {
      if (!existsSync(canvasesDir)) {
        server.config.logger.warn(
          `[studio] Canvas directory is missing: ${canvasesDir}`,
        );
      }

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/canvases")) {
          next();
          return;
        }

        try {
          const url = new URL(req.url, "http://studio.local");
          const parts = url.pathname.split("/").filter(Boolean);
          const id = parts.length === 3 ? decodeURIComponent(parts[2]) : null;

          if (parts.length < 2 || parts.length > 3 || parts[0] !== "api" || parts[1] !== "canvases") {
            sendJson(res, 404, { error: "Not found." });
            return;
          }

          if (req.method === "GET" && !id) {
            const entries = await fs.readdir(canvasesDir, { withFileTypes: true });
            const canvases = [];
            for (const entry of entries) {
              if (!entry.isFile() || !entry.name.endsWith(".canvas.json")) continue;
              const canvasId = entry.name.slice(0, -".canvas.json".length);
              if (!CANVAS_ID_PATTERN.test(canvasId)) continue;
              const filePath = resolve(canvasesDir, entry.name);
              try {
                const [raw, stat] = await Promise.all([
                  fs.readFile(filePath, "utf8"),
                  fs.stat(filePath),
                ]);
                const parsed = JSON.parse(raw) as unknown;
                if (!isRecord(parsed)) continue;
                canvases.push({
                  id: canvasId,
                  title: typeof parsed.title === "string" ? parsed.title : canvasId,
                  updated_at: stat.mtime.toISOString(),
                });
              } catch {
                // Skip malformed or unreadable canvas files; the list endpoint should stay useful.
              }
            }
            canvases.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
            sendJson(res, 200, { canvases });
            return;
          }

          if (!id) {
            if (req.method === "POST" && parts.length === 2) {
              const body = await readJsonBody(req);
              if (!isRecord(body) || typeof body.id !== "string" || !("canvas" in body)) {
                sendJson(res, 400, { error: "Expected body { id, canvas }." });
                return;
              }
              const filePath = filePathForId(canvasesDir, body.id);
              if (!filePath) {
                sendJson(res, 400, { error: "Invalid canvas id." });
                return;
              }
              if (existsSync(filePath)) {
                sendJson(res, 409, { error: "Canvas already exists." });
                return;
              }
              const validation = validateInteractiveCanvasDocument(body.canvas);
              if (!validation.ok) {
                sendJson(res, 422, { error: "Invalid canvas document.", issues: validation.issues });
                return;
              }
              await fs.writeFile(filePath, `${JSON.stringify(validation.document, null, 2)}\n`);
              sendJson(res, 201, { id: body.id });
              return;
            }
            sendJson(res, 405, { error: "Method not allowed." });
            return;
          }

          const filePath = filePathForId(canvasesDir, id);
          if (!filePath || basename(filePath) !== `${id}.canvas.json`) {
            sendJson(res, 400, { error: "Invalid canvas id." });
            return;
          }

          if (req.method === "GET") {
            if (!existsSync(filePath)) {
              sendJson(res, 404, { error: "Canvas not found." });
              return;
            }
            res.statusCode = 200;
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.write(`{"id":${JSON.stringify(id)},"canvas":`);
            createReadStream(filePath)
              .on("end", () => res.end("}\n"))
              .pipe(res, { end: false });
            return;
          }

          if (req.method === "PUT") {
            const body = await readJsonBody(req);
            if (!isRecord(body) || !("canvas" in body)) {
              sendJson(res, 400, { error: "Expected body { canvas }." });
              return;
            }
            const validation = validateInteractiveCanvasDocument(body.canvas);
            if (!validation.ok) {
              sendJson(res, 422, { error: "Invalid canvas document.", issues: validation.issues });
              return;
            }
            await fs.writeFile(filePath, `${JSON.stringify(validation.document, null, 2)}\n`);
            sendJson(res, 200, { id });
            return;
          }

          if (req.method === "DELETE") {
            try {
              await fs.unlink(filePath);
              sendJson(res, 200, { ok: true });
            } catch {
              sendJson(res, 404, { error: "Canvas not found." });
            }
            return;
          }

          sendJson(res, 405, { error: "Method not allowed." });
        } catch (error) {
          sendJson(res, 400, {
            error: error instanceof Error ? error.message : "Bad request.",
          });
        }
      });
    },
  };
}

export default defineConfig({
  appType: "spa",
  plugins: [canvasFileApiPlugin(), react()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3999,
  },
  preview: {
    host: "0.0.0.0",
    port: 3999,
  },
});
