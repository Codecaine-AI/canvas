import { promises as fs } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { canvasContentHash } from "./canvas-file-api";
// Relative import for the same Vite/Electron bundling reason as canvas-file-api.ts.
import { CANVAS_STYLE_FILENAME } from "../../canvas/src/theme/canvas-style.ts";

/** Vite HMR custom event Studio listens for (see App.tsx). */
export const CANVAS_FILE_CHANGED_EVENT = "canvas:file-changed";

export type CanvasFileChangedPayload = {
  id: string;
  /** sha256 of the new file bytes — the revision the client should reload. */
  hash: string;
};

/** Vite HMR custom event for canvas-style.json (the workspace style settings). */
export const CANVAS_STYLE_CHANGED_EVENT = "canvas:style-changed";

export type CanvasStyleChangedPayload = {
  /** sha256 of the new file bytes, or null when the file was deleted. */
  hash: string | null;
};

// Types `import.meta.hot.on("canvas:file-changed", ...)` in the client.
declare module "vite/types/customEvent.d.ts" {
  interface CustomEventMap {
    "canvas:file-changed": CanvasFileChangedPayload;
    "canvas:style-changed": CanvasStyleChangedPayload;
  }
}

const CANVAS_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const CANVAS_SUFFIX = ".canvas.json";

/**
 * Turns raw filesystem events for the canvases directory into
 * `canvas:file-changed` notifications, minus Studio's own writes.
 *
 * One map holds the last known content hash per canvas id. The file API
 * records every hash it is about to write (recordWrite); each fs event
 * rehashes the file and only notifies when the hash differs from the last
 * known one. That both suppresses self-writes and collapses the duplicate
 * change/add events a single atomic rename tends to produce.
 *
 * canvas-style.json gets the same treatment on its own channel
 * (`sendStyleChanged`), including deletion — feed `unlink` events too; a
 * Studio reset deletes the file, an agent or hand edit may as well.
 */
export function createCanvasChangeNotifier(options: {
  canvasesDir: string;
  send: (payload: CanvasFileChangedPayload) => void;
  sendStyleChanged?: (payload: CanvasStyleChangedPayload) => void;
}) {
  const canvasesDir = resolve(options.canvasesDir);
  const knownHashes = new Map<string, string>();
  /** undefined = unknown; null = known absent. */
  let knownStyleHash: string | null | undefined;

  async function handleStyleEvent(absolute: string): Promise<void> {
    let hash: string | null;
    try {
      hash = canvasContentHash(await fs.readFile(absolute));
    } catch {
      hash = null;
    }
    if (knownStyleHash === hash) return;
    knownStyleHash = hash;
    options.sendStyleChanged?.({ hash });
  }

  return {
    recordWrite(id: string, hash: string) {
      knownHashes.set(id, hash);
    },

    /** Studio's own canvas-style.json write (null = the write deletes it). */
    recordStyleWrite(hash: string | null) {
      knownStyleHash = hash;
    },

    /**
     * Feed any watcher event path (add/change/unlink); files other than
     * canvases and canvas-style.json are ignored. Resolves the canvas payload
     * it sent, if any — style changes go out through sendStyleChanged only.
     */
    async handleFileEvent(path: string): Promise<CanvasFileChangedPayload | null> {
      const absolute = resolve(path);
      const name = basename(absolute);
      if (dirname(absolute) !== canvasesDir) return null;
      if (name === CANVAS_STYLE_FILENAME) {
        await handleStyleEvent(absolute);
        return null;
      }
      if (!name.endsWith(CANVAS_SUFFIX)) return null;
      const id = name.slice(0, -CANVAS_SUFFIX.length);
      if (!CANVAS_ID_PATTERN.test(id)) return null;

      let hash: string;
      try {
        hash = canvasContentHash(await fs.readFile(absolute));
      } catch {
        // Deleted or replaced again before we could read it — the next event wins.
        return null;
      }
      if (knownHashes.get(id) === hash) return null;
      knownHashes.set(id, hash);
      const payload = { id, hash };
      options.send(payload);
      return payload;
    },
  };
}
