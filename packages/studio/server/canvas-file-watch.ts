import { promises as fs } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { canvasContentHash } from "./canvas-file-api";

/** Vite HMR custom event Studio listens for (see App.tsx). */
export const CANVAS_FILE_CHANGED_EVENT = "canvas:file-changed";

export type CanvasFileChangedPayload = {
  id: string;
  /** sha256 of the new file bytes — the revision the client should reload. */
  hash: string;
};

// Types `import.meta.hot.on("canvas:file-changed", ...)` in the client.
declare module "vite/types/customEvent.d.ts" {
  interface CustomEventMap {
    "canvas:file-changed": CanvasFileChangedPayload;
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
 */
export function createCanvasChangeNotifier(options: {
  canvasesDir: string;
  send: (payload: CanvasFileChangedPayload) => void;
}) {
  const canvasesDir = resolve(options.canvasesDir);
  const knownHashes = new Map<string, string>();

  return {
    recordWrite(id: string, hash: string) {
      knownHashes.set(id, hash);
    },

    /** Feed any watcher event path; non-canvas files are ignored. */
    async handleFileEvent(path: string): Promise<CanvasFileChangedPayload | null> {
      const absolute = resolve(path);
      const name = basename(absolute);
      if (dirname(absolute) !== canvasesDir || !name.endsWith(CANVAS_SUFFIX)) return null;
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
