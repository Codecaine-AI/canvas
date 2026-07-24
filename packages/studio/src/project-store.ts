import {
  validateInteractiveCanvasDocument,
  type InteractiveCanvasDocument,
} from "@codecaine-ai/canvas";

/**
 * Project-board persistence: boards that live as `.canvas.json` sidecar files
 * in a docs repo, served over HTTP by docs-server. Unlike local drafts
 * (board-store.ts) these are never copied into localStorage — the file on disk
 * is the source of truth, and saves round-trip through the server's
 * content_hash precondition (409 when the file changed under us). Only the
 * server ORIGIN is persisted locally.
 */

const SERVER_STORAGE_KEY = "codecaine-studio-project-server";

export const DEFAULT_PROJECT_SERVER = "http://localhost:4803";

/** Trims whitespace and trailing slashes; falls back to the default origin. */
export function normalizeServerOrigin(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed || DEFAULT_PROJECT_SERVER;
}

export function getStoredProjectServer(): string {
  if (typeof window === "undefined") return DEFAULT_PROJECT_SERVER;
  try {
    const raw = window.localStorage.getItem(SERVER_STORAGE_KEY);
    return raw ? normalizeServerOrigin(raw) : DEFAULT_PROJECT_SERVER;
  } catch {
    return DEFAULT_PROJECT_SERVER;
  }
}

export function storeProjectServer(origin: string): string {
  const normalized = normalizeServerOrigin(origin);
  try {
    window.localStorage.setItem(SERVER_STORAGE_KEY, normalized);
  } catch {
    // Storage unavailable (private mode etc.) — the in-memory value still works.
  }
  return normalized;
}

export type ProjectBoardSummary = {
  /** Docs-root-relative sidecar path — the board's identity on the server. */
  src: string;
  canvasPath: string;
  id: string;
  title: string;
  updatedAt: string;
};

export type ProjectBoard = {
  /** Origin the board was loaded from — saves go back to the same server. */
  server: string;
  src: string;
  canvasPath: string;
  /** Server hash of the loaded bytes — sent as original_hash on save. */
  contentHash: string;
  document: InteractiveCanvasDocument;
};

/** PUT /api/canvas answered 409 — the sidecar changed on disk since load. */
export class ProjectSaveConflictError extends Error {
  currentHash?: string;

  constructor(detail: string, currentHash?: string) {
    super(detail);
    this.name = "ProjectSaveConflictError";
    this.currentHash = currentHash;
  }
}

function errorDetail(payload: unknown, fallback: string): string {
  if (
    payload &&
    typeof payload === "object" &&
    typeof (payload as { detail?: unknown }).detail === "string"
  ) {
    return (payload as { detail: string }).detail;
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function listProjectBoards(server: string): Promise<ProjectBoardSummary[]> {
  const response = await fetch(`${server}/api/canvases`);
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(errorDetail(payload, `Board list failed (${response.status}).`));
  }
  const canvases = (payload as { canvases?: unknown })?.canvases;
  if (!Array.isArray(canvases)) {
    throw new Error("Board list response is malformed.");
  }
  return canvases.map((entry) => {
    const record = entry as Record<string, unknown>;
    const src = typeof record.src === "string" ? record.src : "";
    const canvasPath = typeof record.canvas_path === "string" ? record.canvas_path : src;
    return {
      src,
      canvasPath,
      id: typeof record.id === "string" ? record.id : src,
      title:
        typeof record.title === "string" && record.title.trim()
          ? record.title
          : canvasPath.split("/").pop() ?? src,
      updatedAt: typeof record.updated_at === "string" ? record.updated_at : "",
    };
  });
}

export async function loadProjectBoard(server: string, src: string): Promise<ProjectBoard> {
  const response = await fetch(`${server}/api/canvas?src=${encodeURIComponent(src)}`);
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(errorDetail(payload, `Board load failed (${response.status}).`));
  }
  const record = payload as {
    canvas_path?: unknown;
    content_hash?: unknown;
    canvas?: unknown;
  };
  if (typeof record?.content_hash !== "string") {
    throw new Error("Board response is missing its content hash.");
  }
  const validation = validateInteractiveCanvasDocument(record.canvas);
  if (!validation.ok) {
    const summary = validation.issues
      .slice(0, 3)
      .map((issue) => `${issue.path}: ${issue.message}`)
      .join("; ");
    throw new Error(`Board failed validation — ${summary}`);
  }
  return {
    server,
    src,
    canvasPath: typeof record.canvas_path === "string" ? record.canvas_path : src,
    contentHash: record.content_hash,
    document: validation.document,
  };
}

/**
 * Saves an existing sidecar back through PUT /api/canvas, passing the tracked
 * content hash as `original_hash` so a concurrent on-disk edit surfaces as a
 * 409 (thrown as ProjectSaveConflictError) instead of being clobbered.
 * Returns the new content hash to track for the next save.
 */
export async function saveProjectBoard(
  board: ProjectBoard,
  document: InteractiveCanvasDocument,
): Promise<string> {
  const response = await fetch(`${board.server}/api/canvas`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      src: board.src,
      original_hash: board.contentHash,
      canvas: document,
    }),
  });
  const payload = await readJson(response);
  if (response.status === 409) {
    const currentHash = (payload as { current_hash?: unknown })?.current_hash;
    throw new ProjectSaveConflictError(
      errorDetail(payload, "Canvas sidecar is stale; reload before saving."),
      typeof currentHash === "string" ? currentHash : undefined,
    );
  }
  if (!response.ok) {
    throw new Error(errorDetail(payload, `Save failed (${response.status}).`));
  }
  const contentHash = (payload as { content_hash?: unknown })?.content_hash;
  if (typeof contentHash !== "string") {
    throw new Error("Save response is missing its content hash.");
  }
  return contentHash;
}
