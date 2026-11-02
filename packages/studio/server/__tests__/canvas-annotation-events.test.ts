/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type ClientRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CANVAS_ANNOTATION_EVENTS_ROUTE,
  createCanvasAnnotationEvents,
} from "../canvas-annotation-events";
import { createCanvasFileApiHandler } from "../canvas-file-api";
import { createCanvasChangeNotifier } from "../canvas-file-watch";

const REGION = { kind: "region", region: { x: 0, y: 0, width: 96, height: 64 } };

function annotation(overrides: Record<string, unknown> = {}) {
  return {
    id: "request-1",
    target: REGION,
    intent: "agent-request",
    body: "Tidy this area",
    status: "open",
    createdBy: "human",
    replies: [],
    ...overrides,
  };
}

function board(annotations: unknown[] = []) {
  return {
    schemaVersion: 1,
    id: "board-a",
    title: "Board A",
    mode: "diagram",
    objects: [],
    connections: [],
    annotations,
  };
}

let dir: string;
let boardPath: string;
let server: Server;
let origin: string;
let notifier: ReturnType<typeof createCanvasChangeNotifier>;
let stream: ClientRequest | null;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "studio-annotation-events-"));
  boardPath = join(dir, "board-a.canvas.json");
  // On disk before the hub starts, so its scan knows the board.
  writeFileSync(boardPath, `${JSON.stringify(board([annotation({ id: "note-0", intent: "note" })]), null, 2)}\n`);
  // Wired as vite.config.ts wires it: one hub for Studio's saves and the watcher.
  const annotationEvents = createCanvasAnnotationEvents({ canvasesDir: dir });
  notifier = createCanvasChangeNotifier({
    canvasesDir: dir,
    send: () => {},
    onCanvasContents: (id, contents) => void annotationEvents.publish(id, contents),
  });
  const handler = createCanvasFileApiHandler({
    canvasesDir: dir,
    onCanvasWrite: notifier.recordWrite,
    annotationEvents,
  });
  server = createServer((req, res) => {
    handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  stream = null;
});

afterEach(async () => {
  stream?.destroy();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

// node:http rather than fetch: the happy-dom preload swaps in a browser fetch
// that enforces same-origin policy against this local server.
function send(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; json: Record<string, any> }>((resolve, reject) => {
    const req = request(
      `${origin}${path}`,
      { method, headers: { "content-type": "application/json", ...headers } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, json: JSON.parse(Buffer.concat(chunks).toString("utf8")) }),
        );
      },
    );
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

/** Opens the SSE stream and resolves once its `connected` frame arrives. */
function openStream(): Promise<{ events: unknown[]; next(count: number): Promise<unknown[]> }> {
  return new Promise((resolve, reject) => {
    const events: unknown[] = [];
    let wake = () => {};
    let buffer = "";
    stream = request(`${origin}${CANVAS_ANNOTATION_EVENTS_ROUTE}`, (res) => {
      expect(res.headers["content-type"]).toBe("text/event-stream");
      res.on("data", (chunk: Buffer) => {
        buffer += chunk.toString("utf8");
        let end: number;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          if (frame.startsWith("event: connected")) {
            resolve({
              events,
              next: (count) =>
                new Promise((done) => {
                  wake = () => events.length >= count && done(events.slice(0, count));
                  wake();
                }),
            });
          } else if (frame.startsWith("data: ")) {
            events.push(JSON.parse(frame.slice("data: ".length)) as unknown);
            wake();
          }
        }
      });
    });
    stream.on("error", reject);
    stream.end();
  });
}

describe("canvas studio annotation events", () => {
  it("emits a created event naming the request when Studio saves a new agent-request annotation", async () => {
    const sse = await openStream();
    const response = await send("PUT", "/api/canvases/board-a", {
      canvas: board([annotation({ id: "note-0", intent: "note" }), annotation()]),
    });
    expect(response.status).toBe(200);

    expect(await sse.next(1)).toEqual([
      {
        path: boardPath,
        canvasId: "board-a",
        annotation: { id: "request-1", intent: "agent-request", change: "created" },
      },
    ]);
  });

  it("binds a thread through the PUT route, keeps it across a reload, and leaves the annotation open", async () => {
    writeFileSync(boardPath, `${JSON.stringify(board([annotation()]), null, 2)}\n`);
    await notifier.handleFileEvent(boardPath);
    const sse = await openStream();
    const loaded = await send("GET", "/api/canvases/board-a");

    const bound = await send(
      "PUT",
      "/api/canvases/board-a/annotations/request-1/thread",
      { thread: { id: "thread-42", title: "Board A" } },
      { "if-match": `"${loaded.json.contentHash}"` },
    );
    expect(bound.status).toBe(200);
    expect(bound.json.annotation).toMatchObject({ id: "request-1", status: "open", thread: { id: "thread-42", title: "Board A" } });
    // The binding comes from outside Studio, so the watcher tells open tabs to reload.
    expect(await notifier.handleFileEvent(boardPath)).toEqual({ id: "board-a", hash: bound.json.contentHash });

    const reloaded = await send("GET", "/api/canvases/board-a");
    expect(reloaded.json.contentHash).toBe(bound.json.contentHash);
    expect(reloaded.json.canvas.annotations[0]).toMatchObject({ status: "open", thread: { id: "thread-42", title: "Board A" } });

    const cleared = await send(
      "PUT",
      "/api/canvases/board-a/annotations/request-1/thread",
      { thread: null },
      { "if-match": `"${bound.json.contentHash}"` },
    );
    expect(cleared.status).toBe(200);
    expect(cleared.json.annotation.thread).toBeUndefined();
    expect(JSON.parse(readFileSync(boardPath, "utf8")).annotations[0]).not.toHaveProperty("thread");

    const thread = { path: boardPath, canvasId: "board-a", annotation: { id: "request-1", intent: "agent-request", change: "thread" } };
    expect(await sse.next(2)).toEqual([thread, thread]);
    expect(sse.events).toHaveLength(2);
  });

  it("refuses a stale hash, a bad thread id, and an unknown annotation without writing", async () => {
    const before = readFileSync(boardPath);
    const route = "/api/canvases/board-a/annotations/note-0/thread";

    const stale = await send("PUT", route, { thread: { id: "thread-42" } }, { "if-match": '"stale"' });
    expect(stale.status).toBe(412);
    const badId = await send("PUT", route, { thread: { id: "" } });
    expect(badId.status).toBe(422);
    expect(badId.json.issues[0].path).toBe("$.annotations[0].thread.id");
    const unknown = await send("PUT", "/api/canvases/board-a/annotations/missing/thread", { thread: { id: "thread-42" } });
    expect(unknown.status).toBe(404);

    expect(readFileSync(boardPath).equals(before)).toBe(true);
  });

  it("emits replied and resolved for an outside write, such as the canvas MCP, and once only for Studio's own save", async () => {
    writeFileSync(boardPath, `${JSON.stringify(board([annotation({ id: "note-0", intent: "note" }), annotation()]), null, 2)}\n`);
    await notifier.handleFileEvent(boardPath);
    const sse = await openStream();

    // The canvas MCP writes the file directly; Studio sees it through the watcher.
    const reply = { id: "reply-1", author: "agent", body: "Done." };
    writeFileSync(
      boardPath,
      JSON.stringify(board([annotation({ id: "note-0", intent: "note" }), annotation({ status: "applied", replies: [reply] })])),
    );
    await notifier.handleFileEvent(boardPath);

    // Studio's own save, then the watcher's echo of it.
    await send("PUT", "/api/canvases/board-a", {
      canvas: board([annotation({ id: "note-0", intent: "note", status: "resolved" }), annotation({ status: "applied", replies: [reply] })]),
    });
    await notifier.handleFileEvent(boardPath);

    const event = (id: string, intent: string, change: string) => ({ path: boardPath, canvasId: "board-a", annotation: { id, intent, change } });
    expect(await sse.next(3)).toEqual([
      event("request-1", "agent-request", "replied"),
      event("request-1", "agent-request", "resolved"),
      event("note-0", "note", "resolved"),
    ]);
    expect(sse.events).toHaveLength(3);
  });
});
