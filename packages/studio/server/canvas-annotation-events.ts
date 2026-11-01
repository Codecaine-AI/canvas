import { promises as fs } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
// Relative import for the same Vite/Electron bundling reason as canvas-file-api.ts.
import { validateInteractiveCanvasDocument } from "../../canvas/src/state/schema.ts";
import type {
  CanvasAnnotationIntent,
  InteractiveCanvasAnnotation,
} from "../../canvas/src/state/schema.ts";

/** The SSE stream of annotation events. Outside /api/canvases so no board id can shadow it. */
export const CANVAS_ANNOTATION_EVENTS_ROUTE = "/api/canvas-annotation-events";

const CANVAS_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const CANVAS_SUFFIX = ".canvas.json";
const KEEPALIVE_MS = 30_000;

/** Which annotation a change touched, the same shape as docs-server's DocsAnnotationChange. */
export type CanvasAnnotationChange = {
  id: string;
  intent: CanvasAnnotationIntent;
  change: "created" | "replied" | "resolved" | "thread";
};

export type CanvasAnnotationEvent = {
  /** Absolute path of the board file. */
  path: string;
  /** The board id: the file name without `.canvas.json`. */
  canvasId: string;
  annotation: CanvasAnnotationChange;
};

function sameThread(a: InteractiveCanvasAnnotation["thread"], b: InteractiveCanvasAnnotation["thread"]) {
  return a?.id === b?.id && a?.title === b?.title;
}

/** Every annotation change between two saved revisions of one board, in document order. */
export function diffAnnotations(
  before: InteractiveCanvasAnnotation[],
  after: InteractiveCanvasAnnotation[],
): CanvasAnnotationChange[] {
  const previous = new Map(before.map((annotation) => [annotation.id, annotation]));
  const changes: CanvasAnnotationChange[] = [];
  for (const annotation of after) {
    const { id, intent } = annotation;
    const old = previous.get(id);
    if (!old) {
      changes.push({ id, intent, change: "created" });
      if (annotation.thread) changes.push({ id, intent, change: "thread" });
      continue;
    }
    if (annotation.replies.length > old.replies.length) changes.push({ id, intent, change: "replied" });
    if (old.status === "open" && annotation.status !== "open") changes.push({ id, intent, change: "resolved" });
    if (!sameThread(old.thread, annotation.thread)) changes.push({ id, intent, change: "thread" });
  }
  return changes;
}

function annotationsOf(contents: string | Buffer): InteractiveCanvasAnnotation[] | null {
  try {
    const validation = validateInteractiveCanvasDocument(JSON.parse(contents.toString()));
    return validation.ok ? (validation.document.annotations ?? []) : null;
  } catch {
    return null;
  }
}

/**
 * Turns saved board revisions into annotation events.
 *
 * One map holds the last saved annotations per board. Each `publish` diffs the
 * new revision against it, so Studio's own write and the file watcher's echo
 * of that write emit once, and an outside writer (the canvas MCP) emits too.
 * The map starts from a scan of the canvases directory, so a board unknown to
 * it is a new board and every annotation on it counts as created.
 */
export function createCanvasAnnotationEvents(options: { canvasesDir: string }) {
  const canvasesDir = resolve(options.canvasesDir);
  const known = new Map<string, InteractiveCanvasAnnotation[]>();
  const listeners = new Set<(event: CanvasAnnotationEvent) => void>();

  // Every publish waits for the scan and for the publish before it.
  let queue: Promise<unknown> = (async () => {
    const entries = await fs.readdir(canvasesDir).catch(() => [] as string[]);
    for (const name of entries) {
      const canvasId = name.slice(0, -CANVAS_SUFFIX.length);
      if (!name.endsWith(CANVAS_SUFFIX) || !CANVAS_ID_PATTERN.test(canvasId)) continue;
      const contents = await fs.readFile(resolve(canvasesDir, name)).catch(() => null);
      const annotations = contents && annotationsOf(contents);
      if (annotations) known.set(canvasId, annotations);
    }
  })();

  function publish(canvasId: string, contents: string | Buffer): Promise<CanvasAnnotationEvent[]> {
    const run = queue.then(() => {
      const after = annotationsOf(contents);
      if (!after) return [];
      const changes = diffAnnotations(known.get(canvasId) ?? [], after);
      known.set(canvasId, after);
      const path = resolve(canvasesDir, `${canvasId}${CANVAS_SUFFIX}`);
      const events = changes.map((annotation) => ({ path, canvasId, annotation }));
      for (const event of events) for (const listener of listeners) listener(event);
      return events;
    });
    queue = run.catch(() => {});
    return run;
  }

  function subscribe(listener: (event: CanvasAnnotationEvent) => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  /**
   * GET /api/canvas-annotation-events: one unnamed `data:` frame per event,
   * after a named `connected` frame that flushes the headers, with a named
   * `keepalive` frame every 30 seconds. There is no replay.
   */
  function handleStream(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    res.write("event: connected\ndata: ok\n\n");
    const unsubscribe = subscribe((event) => res.write(`data: ${JSON.stringify(event)}\n\n`));
    const keepalive = setInterval(() => res.write("event: keepalive\ndata: ok\n\n"), KEEPALIVE_MS);
    req.on("close", () => {
      clearInterval(keepalive);
      unsubscribe();
    });
  }

  return { publish, subscribe, handleStream };
}

export type CanvasAnnotationEvents = ReturnType<typeof createCanvasAnnotationEvents>;
