import { createHash } from "node:crypto";
import { createReadStream, existsSync, promises as fs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { basename, resolve, sep } from "node:path";
// Vite externalizes bare package imports while bundling its Node-side config.
// A relative import keeps the workspace's raw public schema entry in both the
// Vite config bundle and the Electron esbuild bundle.
import { validateInteractiveCanvasDocument } from "../../canvas/src/state/schema.ts";
import type { InteractiveCanvasDocument } from "../../canvas/src/state/schema.ts";
// Same relative-import rule as the schema import above: the Electron esbuild
// bundle must resolve the renderer from source, not the package name.
import { renderDocumentToSvg } from "../../canvas/src/render/static-svg.ts";

const CANVAS_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const JSON_LIMIT_BYTES = 5 * 1024 * 1024;
const PREVIEW_MIN_DIMENSION = 16;
const PREVIEW_MAX_DIMENSION = 4000;
const PREVIEW_DEFAULT_WIDTH = 640;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload)}\n`);
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
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

/**
 * Write via a temp file in the same directory plus rename — atomic on the
 * same filesystem, so a crash mid-write can never leave a half-written
 * canvas file behind.
 */
async function writeFileAtomic(filePath: string, contents: string): Promise<void> {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tempPath, contents);
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    await fs.unlink(tempPath).catch(() => {});
    throw error;
  }
}

function filePathForId(canvasesDir: string, id: string): string | null {
  if (!CANVAS_ID_PATTERN.test(id)) return null;
  const filePath = resolve(canvasesDir, `${id}.canvas.json`);
  const confinedRoot = canvasesDir.endsWith(sep) ? canvasesDir : `${canvasesDir}${sep}`;
  return filePath.startsWith(confinedRoot) ? filePath : null;
}

function parsePreviewDimension(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(PREVIEW_MAX_DIMENSION, Math.max(PREVIEW_MIN_DIMENSION, value));
}

/** World-space padding override (`pad=`) — small non-negative numbers only. */
function parsePreviewPadding(raw: string | null): number | undefined {
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number.parseFloat(raw);
  if (!Number.isFinite(value) || value < 0) return undefined;
  return Math.min(400, value);
}

function etagMatches(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header
    .split(",")
    .map((candidate) => candidate.trim())
    .some((candidate) => candidate === etag || candidate === `W/${etag}`);
}

export function createCanvasFileApiHandler(options: {
  canvasesDir: string;
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void {
  const { canvasesDir } = options;

  return (req, res, next) => {
    if (!req.url?.startsWith("/api/canvases")) {
      next();
      return;
    }

    void (async () => {
      try {
        const url = new URL(req.url!, "http://studio.local");
        const parts = url.pathname.split("/").filter(Boolean);
        const isPreview = parts.length === 4 && parts[3] === "preview.svg";
        const id = parts.length === 3 || isPreview ? decodeURIComponent(parts[2]) : null;

        if (
          parts.length < 2 ||
          parts.length > 4 ||
          parts[0] !== "api" ||
          parts[1] !== "canvases" ||
          (parts.length === 4 && !isPreview)
        ) {
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
            await writeFileAtomic(filePath, `${JSON.stringify(validation.document, null, 2)}\n`);
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

        if (isPreview) {
          if (req.method !== "GET") {
            sendJson(res, 405, { error: "Method not allowed." });
            return;
          }

          let mtimeMs: number;
          try {
            mtimeMs = (await fs.stat(filePath)).mtimeMs;
          } catch {
            sendJson(res, 404, { error: "Canvas not found." });
            return;
          }

          const sectionId = url.searchParams.get("section") ?? undefined;
          const fit = url.searchParams.get("fit") === "content" ? ("content" as const) : undefined;
          const padding = parsePreviewPadding(url.searchParams.get("pad"));
          let width = parsePreviewDimension(url.searchParams.get("w"));
          let height = parsePreviewDimension(url.searchParams.get("h"));
          if (width === undefined && height === undefined) {
            width = PREVIEW_DEFAULT_WIDTH;
          }

          const etag = `"${createHash("sha1")
            .update(
              `${mtimeMs}|${sectionId ?? ""}|${width ?? ""}|${height ?? ""}|${fit ?? ""}|${padding ?? ""}`,
            )
            .digest("hex")}"`;
          res.setHeader("etag", etag);
          res.setHeader("cache-control", "no-cache");
          if (etagMatches(req.headers["if-none-match"], etag)) {
            res.statusCode = 304;
            res.end();
            return;
          }

          let svg: string;
          try {
            const raw = await fs.readFile(filePath, "utf8");
            const parsed = JSON.parse(raw) as InteractiveCanvasDocument;
            svg = renderDocumentToSvg(parsed, {
              sectionId,
              fit,
              padding,
              width,
              height,
              background: "board",
            }).svg;
          } catch {
            res.statusCode = 500;
            res.setHeader("content-type", "text/plain; charset=utf-8");
            res.end("Canvas preview could not be rendered.\n");
            return;
          }

          res.statusCode = 200;
          res.setHeader("content-type", "image/svg+xml; charset=utf-8");
          res.end(svg);
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
          await writeFileAtomic(filePath, `${JSON.stringify(validation.document, null, 2)}\n`);
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
    })();
  };
}
