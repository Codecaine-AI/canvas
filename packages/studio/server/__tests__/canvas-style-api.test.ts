/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_CANVAS_STYLE } from "../../../canvas/src/theme/canvas-style.ts";
import { createCanvasFileApiHandler } from "../canvas-file-api";
import { createCanvasChangeNotifier, type CanvasStyleChangedPayload } from "../canvas-file-watch";

let dir: string;
let server: Server;
let origin: string;
let styleEvents: CanvasStyleChangedPayload[];
let notifier: ReturnType<typeof createCanvasChangeNotifier>;

const stylePath = () => join(dir, "canvas-style.json");

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "studio-canvas-style-"));
  styleEvents = [];
  notifier = createCanvasChangeNotifier({
    canvasesDir: dir,
    send: () => {},
    sendStyleChanged: (payload) => styleEvents.push(payload),
  });
  const handler = createCanvasFileApiHandler({
    canvasesDir: dir,
    onCanvasWrite: notifier.recordWrite,
    onCanvasStyleWrite: notifier.recordStyleWrite,
  });
  server = createServer((req, res) => {
    handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

type TestResponse = { status: number; etag: string | undefined; text: string };

// node:http rather than fetch — see canvas-file-api.test.ts.
function send(method: string, path: string, body?: unknown) {
  return new Promise<TestResponse>((resolve, reject) => {
    const headers: Record<string, string> = body === undefined ? {} : { "content-type": "application/json" };
    const req = request(`${origin}${path}`, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        resolve({
          status: res.statusCode ?? 0,
          etag: res.headers.etag,
          text: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

describe("canvas style API", () => {
  it("GET without a file answers the defaults and no overrides", async () => {
    const response = await send("GET", "/api/canvas-style");
    expect(response.status).toBe(200);
    expect(JSON.parse(response.text)).toEqual({ style: { ...DEFAULT_CANVAS_STYLE }, overrides: {} });
  });

  it("PUT clamps, drops unknown and default-valued keys, and persists only the overrides", async () => {
    const response = await send("PUT", "/api/canvas-style", {
      overrides: {
        shapeCornerRadiusPx: 8,
        connectorStrokeWidthPx: 99,
        sectionBorderWidthPx: DEFAULT_CANVAS_STYLE.sectionBorderWidthPx,
        bogus: 3,
      },
    });
    expect(response.status).toBe(200);
    const expectedOverrides = { shapeCornerRadiusPx: 8, connectorStrokeWidthPx: 8 };
    const payload = JSON.parse(response.text);
    expect(payload.overrides).toEqual(expectedOverrides);
    expect(payload.style).toEqual({ ...DEFAULT_CANVAS_STYLE, ...expectedOverrides });
    expect(readFileSync(stylePath(), "utf8")).toBe(`${JSON.stringify(expectedOverrides, null, 2)}\n`);

    const reread = JSON.parse((await send("GET", "/api/canvas-style")).text);
    expect(reread).toEqual(payload);
  });

  it("PUT with no overrides left deletes the file", async () => {
    await send("PUT", "/api/canvas-style", { overrides: { shapeCornerRadiusPx: 8 } });
    expect(existsSync(stylePath())).toBe(true);
    const response = await send("PUT", "/api/canvas-style", { overrides: {} });
    expect(response.status).toBe(200);
    expect(existsSync(stylePath())).toBe(false);
  });

  it("PUT rejects a body without an overrides object", async () => {
    expect((await send("PUT", "/api/canvas-style", { style: {} })).status).toBe(400);
    expect((await send("PUT", "/api/canvas-style", { overrides: [1] })).status).toBe(400);
  });

  it("a malformed file reads as the defaults", async () => {
    writeFileSync(stylePath(), "{ not json");
    const payload = JSON.parse((await send("GET", "/api/canvas-style")).text);
    expect(payload.overrides).toEqual({});
  });

  it("the canvas list ignores canvas-style.json", async () => {
    writeFileSync(stylePath(), JSON.stringify({ shapeCornerRadiusPx: 8 }));
    writeFileSync(
      join(dir, "board-a.canvas.json"),
      JSON.stringify({ schemaVersion: 1, id: "board-a", title: "Board A", objects: [], connections: [] }),
    );
    const payload = JSON.parse((await send("GET", "/api/canvases")).text) as { canvases: { id: string }[] };
    expect(payload.canvases.map(({ id }) => id)).toEqual(["board-a"]);
  });

  it("a style change rotates the preview ETag", async () => {
    writeFileSync(
      join(dir, "board-a.canvas.json"),
      JSON.stringify({
        schemaVersion: 1,
        id: "board-a",
        mode: "diagram",
        objects: [{ id: "a", type: "rectangle", text: "A", geometry: { x: 10, y: 10, width: 100, height: 60 } }],
        connections: [],
      }),
    );
    const before = await send("GET", "/api/canvases/board-a/preview.svg");
    expect(before.status).toBe(200);
    await send("PUT", "/api/canvas-style", { overrides: { shapeCornerRadiusPx: 12 } });
    const after = await send("GET", "/api/canvases/board-a/preview.svg");
    expect(after.status).toBe(200);
    expect(after.etag).toBeDefined();
    expect(after.etag).not.toBe(before.etag);
  });
});

describe("canvas style change notifications", () => {
  it("suppresses Studio's own writes and deletes", async () => {
    await send("PUT", "/api/canvas-style", { overrides: { shapeCornerRadiusPx: 8 } });
    await notifier.handleFileEvent(stylePath());
    await send("PUT", "/api/canvas-style", { overrides: {} });
    await notifier.handleFileEvent(stylePath());
    expect(styleEvents).toEqual([]);
  });

  it("notifies for an external write and an external delete, once each", async () => {
    writeFileSync(stylePath(), JSON.stringify({ shapeCornerRadiusPx: 4 }));
    await notifier.handleFileEvent(stylePath());
    await notifier.handleFileEvent(stylePath());
    unlinkSync(stylePath());
    await notifier.handleFileEvent(stylePath());
    expect(styleEvents).toHaveLength(2);
    expect(typeof styleEvents[0]?.hash).toBe("string");
    expect(styleEvents[1]).toEqual({ hash: null });
  });
});
