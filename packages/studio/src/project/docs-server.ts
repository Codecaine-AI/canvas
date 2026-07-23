/**
 * Client for a linked docs project's docs-server canvas API.
 *
 * A "linked project" is an external docs repo whose docs-server exposes its
 * `.canvas.json` sidecars over HTTP:
 *
 *   GET  {origin}/api/canvases        -> { canvases: [{ src, canvas_path, id, title, updated_at }] }
 *   GET  {origin}/api/canvas?src=...  -> { canvas_path, canvas_document_path, content_hash, canvas }
 *   PUT  {origin}/api/canvas          -> body { src, original_hash, canvas }
 *        200 { ..., content_hash } | 409 stale hash | 404 missing | 423 locked
 *
 * Project boards stay in the project's own repo — Studio edits them in place
 * over this API and never copies them into the local canvases/ folder. The
 * linked server origin persists in localStorage; http://localhost:4803 is the
 * default a fresh Studio talks to.
 */

export const DEFAULT_PROJECT_SERVER_ORIGIN = "http://localhost:4803";

const ORIGIN_STORAGE_KEY = "studio.project-server-origin";

/** Loose origin parse — accepts bare host:port and strips paths/slashes. */
export function normalizeProjectServerOrigin(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
    return url.origin;
  } catch {
    return null;
  }
}

export function getProjectServerOrigin(): string {
  try {
    const stored = window.localStorage.getItem(ORIGIN_STORAGE_KEY);
    if (stored) {
      const normalized = normalizeProjectServerOrigin(stored);
      if (normalized) return normalized;
    }
  } catch {
    // localStorage unavailable — fall through to the default origin.
  }
  return DEFAULT_PROJECT_SERVER_ORIGIN;
}

export function setProjectServerOrigin(origin: string): void {
  try {
    window.localStorage.setItem(ORIGIN_STORAGE_KEY, origin);
  } catch {
    // Best-effort persistence only.
  }
}

export type ProjectBoardListItem = {
  /** Docs-root-relative sidecar path — the `src` GET /api/canvas accepts. */
  src: string;
  canvas_path: string;
  id: string | null;
  title: string | null;
  updated_at: string;
};

export type ProjectBoardPayload = {
  canvas: unknown;
  contentHash: string;
};

/** 409 — the sidecar changed on disk since it was loaded. */
export class ProjectSaveConflictError extends Error {
  currentHash: string | undefined;

  constructor(detail: string, currentHash?: string) {
    super(detail);
    this.name = "ProjectSaveConflictError";
    this.currentHash = currentHash;
  }
}

/** 423 — another session holds a draft lock on the sidecar. */
export class ProjectBoardLockedError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "ProjectBoardLockedError";
  }
}

async function readJsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const payload = (await response.json()) as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export async function listProjectBoards(
  origin: string,
  signal?: AbortSignal,
): Promise<ProjectBoardListItem[]> {
  const response = await fetch(`${origin}/api/canvases`, { signal });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const payload = (await response.json()) as { canvases?: unknown };
  if (!Array.isArray(payload.canvases)) return [];
  return payload.canvases.filter(
    (entry): entry is ProjectBoardListItem =>
      !!entry &&
      typeof entry === "object" &&
      typeof (entry as ProjectBoardListItem).src === "string",
  );
}

export async function fetchProjectBoard(
  origin: string,
  src: string,
): Promise<ProjectBoardPayload> {
  const response = await fetch(`${origin}/api/canvas?src=${encodeURIComponent(src)}`);
  if (response.status === 404) {
    throw new Error(`Board not found in the linked project: ${src}`);
  }
  if (!response.ok) {
    const body = await readJsonBody(response);
    const detail = typeof body.detail === "string" ? body.detail : response.statusText;
    throw new Error(`${response.status} ${detail}`);
  }
  const payload = await readJsonBody(response);
  if (typeof payload.content_hash !== "string") {
    throw new Error("Project server response is missing content_hash.");
  }
  return { canvas: payload.canvas, contentHash: payload.content_hash };
}

export async function saveProjectBoard(
  origin: string,
  src: string,
  originalHash: string,
  canvas: unknown,
  options?: { keepalive?: boolean },
): Promise<{ contentHash: string }> {
  const response = await fetch(`${origin}/api/canvas`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ src, original_hash: originalHash, canvas }),
    keepalive: options?.keepalive,
  });
  if (response.status === 409) {
    const body = await readJsonBody(response);
    throw new ProjectSaveConflictError(
      typeof body.detail === "string" ? body.detail : "Board changed on disk.",
      typeof body.current_hash === "string" ? body.current_hash : undefined,
    );
  }
  if (response.status === 423) {
    const body = await readJsonBody(response);
    throw new ProjectBoardLockedError(
      typeof body.detail === "string"
        ? body.detail
        : "Another session is editing this board.",
    );
  }
  if (!response.ok) {
    const body = await readJsonBody(response);
    const detail = typeof body.detail === "string" ? body.detail : response.statusText;
    throw new Error(`${response.status} ${detail}`);
  }
  const payload = await readJsonBody(response);
  if (typeof payload.content_hash !== "string") {
    throw new Error("Project server save response is missing content_hash.");
  }
  return { contentHash: payload.content_hash };
}
