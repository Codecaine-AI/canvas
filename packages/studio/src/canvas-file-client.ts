/**
 * Client for Studio's own canvas file API (server/canvas-file-api.ts) —
 * the load/save half that carries the on-disk revision hash.
 *
 *   GET /api/canvases/:id -> { id, contentHash, canvas }       (ETag: "<hash>")
 *   PUT /api/canvases/:id  If-Match: "<hash>"  body { canvas }
 *       200 { id, contentHash } | 412 { currentHash } file changed on disk
 *
 * The hash is sha256 of the file bytes, so an external writer (the canvas MCP
 * server, an editor, git) always rotates it.
 */
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import type {
  CanvasStyle,
  CanvasStyleOverrides,
  CanvasStyleSettings,
} from "@codecaine-ai/canvas/style";

export type LoadedCanvas = {
  canvas: InteractiveCanvasDocument;
  /** Null only when talking to a server that predates content hashes. */
  contentHash: string | null;
};

/** 412 — the file changed on disk since the client's last load or save. */
export class CanvasSaveConflictError extends Error {
  currentHash: string | null;

  constructor(currentHash: string | null) {
    super("Canvas changed on disk since it was loaded.");
    this.name = "CanvasSaveConflictError";
    this.currentHash = currentHash;
  }
}

function canvasUrl(id: string): string {
  return `/api/canvases/${encodeURIComponent(id)}`;
}

/** Resolves null on 404. */
export async function fetchCanvas(id: string): Promise<LoadedCanvas | null> {
  const response = await fetch(canvasUrl(id), { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const payload = (await response.json()) as {
    canvas: InteractiveCanvasDocument;
    contentHash?: string;
  };
  return { canvas: payload.canvas, contentHash: payload.contentHash ?? null };
}

/**
 * PUT the document. With `baseHash` the server only writes if the file is
 * still that revision; `force` drops the check (the "Keep mine" path).
 * Resolves the new content hash.
 */
export async function putCanvas(
  id: string,
  document: InteractiveCanvasDocument,
  options: { baseHash?: string | null; force?: boolean; keepalive?: boolean } = {},
): Promise<string | null> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (options.baseHash && !options.force) headers["if-match"] = `"${options.baseHash}"`;
  const response = await fetch(canvasUrl(id), {
    method: "PUT",
    headers,
    body: JSON.stringify({ canvas: document }),
    keepalive: options.keepalive,
  });
  if (response.status === 412) {
    const payload = (await response.json().catch(() => ({}))) as { currentHash?: string | null };
    throw new CanvasSaveConflictError(payload.currentHash ?? null);
  }
  if (!response.ok) {
    throw new Error(response.status === 409 ? "409 Conflict" : `${response.status} ${response.statusText}`);
  }
  const payload = (await response.json().catch(() => ({}))) as { contentHash?: string };
  return payload.contentHash ?? null;
}

/**
 * Workspace-wide canvas style settings (server/canvas-file-api.ts):
 *
 *   GET /api/canvas-style                        -> { settings, style, overrides, hash }
 *   PUT /api/canvas-style { settings, baseHash } -> { settings, style, overrides, hash }  (normalized)
 *       409 { settings, style, overrides, hash }  the file changed since `baseHash`
 *
 * The file on disk (canvases/canvas-style.json) holds `settings`: the active
 * theme plus each theme's overrides. `style` is the active theme resolved,
 * `overrides` the active theme's entry, and `hash` the file's sha256 (null:
 * no file) — the revision a save names as its base.
 */
export type CanvasStyleState = {
  settings: CanvasStyleSettings;
  style: CanvasStyle;
  overrides: CanvasStyleOverrides;
  hash: string | null;
};

/** The settings file changed since the save's `baseHash`; `current` is what it holds now. */
export class CanvasStyleConflictError extends Error {
  constructor(readonly current: CanvasStyleState) {
    super("canvas-style.json changed since it was loaded");
  }
}

const CANVAS_STYLE_URL = "/api/canvas-style";

export async function fetchCanvasStyle(): Promise<CanvasStyleState> {
  const response = await fetch(CANVAS_STYLE_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as CanvasStyleState;
}

/**
 * PUT the whole settings document, built on the file revision `baseHash`;
 * resolves the server's normalized copy, or rejects with
 * CanvasStyleConflictError when the file has changed since.
 */
export async function putCanvasStyle(
  settings: CanvasStyleSettings,
  options: { baseHash: string | null; keepalive?: boolean },
): Promise<CanvasStyleState> {
  const response = await fetch(CANVAS_STYLE_URL, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ settings, baseHash: options.baseHash }),
    keepalive: options.keepalive,
  });
  if (response.status === 409) throw new CanvasStyleConflictError((await response.json()) as CanvasStyleState);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return (await response.json()) as CanvasStyleState;
}
