/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { canvasContentHash, createCanvasFileApiHandler } from "../canvas-file-api";
import { createCanvasChangeNotifier, type CanvasFileChangedPayload } from "../canvas-file-watch";

function canvasDocument(x = 10) {
  return {
    schemaVersion: 1,
    id: "board-a",
    title: "Board A",
    mode: "diagram",
    size: { width: 960, height: 560 },
    viewport: { x: 0, y: 0, zoom: 1 },
    objects: [
      { id: "a", type: "rectangle", text: "A", geometry: { x, y: 10, width: 100, height: 60 } },
    ],
    connections: [],
    annotations: [],
  };
}

let dir: string;
let server: Server;
let base: string;
let sent: CanvasFileChangedPayload[];
let notifier: ReturnType<typeof createCanvasChangeNotifier>;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "studio-canvas-api-"));
  sent = [];
  notifier = createCanvasChangeNotifier({ canvasesDir: dir, send: (payload) => sent.push(payload) });
  const handler = createCanvasFileApiHandler({
    canvasesDir: dir,
    onCanvasWrite: notifier.recordWrite,
  });
  server = createServer((req, res) => {
    handler(req, res, () => {
      res.statusCode = 404;
      res.end();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/canvases/board-a`;
  writeFileSync(join(dir, "board-a.canvas.json"), `${JSON.stringify(canvasDocument(), null, 2)}\n`);
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dir, { recursive: true, force: true });
});

type TestResponse = {
  status: number;
  etag: string | undefined;
  json(): Promise<unknown>;
};

// node:http rather than fetch: the happy-dom preload swaps in a browser fetch
// that enforces same-origin policy against this local server.
function send(method: string, headers: Record<string, string> = {}, body?: string) {
  return new Promise<TestResponse>((resolve, reject) => {
    const req = request(base, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode ?? 0,
          etag: res.headers.etag,
          json: async () => JSON.parse(text) as unknown,
        });
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

async function get() {
  return send("GET");
}

function put(body: unknown, ifMatch?: string) {
  return send(
    "PUT",
    { "content-type": "application/json", ...(ifMatch ? { "if-match": ifMatch } : {}) },
    JSON.stringify(body),
  );
}

function writeExternally(x: number) {
  writeFileSync(join(dir, "board-a.canvas.json"), JSON.stringify(canvasDocument(x)));
}

describe("canvas file API revisions", () => {
  it("GET returns the sha256 of the file bytes as body hash and ETag", async () => {
    const response = await get();
    const payload = (await response.json()) as { contentHash: string; canvas: { id: string } };
    const expected = canvasContentHash(readFileSync(join(dir, "board-a.canvas.json")));
    expect(payload.contentHash).toBe(expected);
    expect(response.etag).toBe(`"${expected}"`);
    expect(payload.canvas.id).toBe("board-a");
  });

  it("PUT with a matching If-Match writes and returns the new hash", async () => {
    const { contentHash } = (await (await get()).json()) as { contentHash: string };
    const response = await put({ canvas: canvasDocument(50) }, `"${contentHash}"`);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { contentHash: string };
    const onDisk = readFileSync(join(dir, "board-a.canvas.json"));
    expect(payload.contentHash).toBe(canvasContentHash(onDisk));
    expect(JSON.parse(onDisk.toString("utf8")).objects[0].geometry.x).toBe(50);
  });

  it("PUT with a stale If-Match answers 412 and leaves the file alone", async () => {
    const { contentHash } = (await (await get()).json()) as { contentHash: string };
    writeExternally(77);
    const externalBytes = readFileSync(join(dir, "board-a.canvas.json"));

    const response = await put({ canvas: canvasDocument(50) }, `"${contentHash}"`);
    expect(response.status).toBe(412);
    const payload = (await response.json()) as { currentHash: string };
    expect(payload.currentHash).toBe(canvasContentHash(externalBytes));
    expect(readFileSync(join(dir, "board-a.canvas.json")).equals(externalBytes)).toBe(true);
  });

  it("PUT without If-Match still overwrites (legacy clients and Keep mine)", async () => {
    writeExternally(77);
    const response = await put({ canvas: canvasDocument(50) });
    expect(response.status).toBe(200);
    const onDisk = JSON.parse(readFileSync(join(dir, "board-a.canvas.json"), "utf8"));
    expect(onDisk.objects[0].geometry.x).toBe(50);
  });
});

describe("canvas change notifier", () => {
  const filePath = () => join(dir, "board-a.canvas.json");

  it("suppresses Studio's own PUT and notifies for an external write", async () => {
    const { contentHash } = (await (await get()).json()) as { contentHash: string };
    await put({ canvas: canvasDocument(50) }, `"${contentHash}"`);
    expect(await notifier.handleFileEvent(filePath())).toBeNull();

    writeExternally(77);
    const payload = await notifier.handleFileEvent(filePath());
    expect(payload).toEqual({
      id: "board-a",
      hash: canvasContentHash(readFileSync(filePath())),
    });
    expect(sent).toEqual([payload!]);
  });

  it("collapses repeated events for the same bytes", async () => {
    writeExternally(77);
    await notifier.handleFileEvent(filePath());
    await notifier.handleFileEvent(filePath());
    expect(sent).toHaveLength(1);
  });

  it("ignores temp files and files outside the canvases dir", async () => {
    const tempPath = `${filePath()}.123.456.tmp`;
    writeFileSync(tempPath, "{}");
    expect(await notifier.handleFileEvent(tempPath)).toBeNull();
    expect(await notifier.handleFileEvent(join(tmpdir(), "board-a.canvas.json"))).toBeNull();
    expect(sent).toHaveLength(0);
  });
});

describe("canvas previews", () => {
  it("embed the bundled faces their text was measured with (an <img> SVG cannot use the page's fonts)", async () => {
    const svg = await new Promise<string>((resolve, reject) => {
      const req = request(`${base}/preview.svg`, { method: "GET" }, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      });
      req.on("error", reject);
      req.end();
    });
    const rule = /@font-face\{font-family:"Inter";font-style:normal;font-weight:(\d+);src:url\(data:font\/woff2;base64,([A-Za-z0-9+/=]+)\)/.exec(svg);
    expect(rule).not.toBeNull();
    const file = { "400": "Inter-Regular", "500": "Inter-Medium", "600": "Inter-SemiBold", "700": "Inter-Bold" }[rule![1]!]!;
    const bytes = readFileSync(fileURLToPath(import.meta.resolve(`@codecaine-ai/text-measure/fonts/${file}.woff2`)));
    expect(rule![2]).toBe(bytes.toString("base64"));
  });
});
