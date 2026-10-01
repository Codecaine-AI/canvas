/// <reference types="bun" />

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { DEFAULT_CANVAS_STYLE, canvasThemePreset } from "../../../canvas/src/theme/canvas-style.ts";
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

const readStyleFile = () => JSON.parse(readFileSync(stylePath(), "utf8")) as unknown;

describe("canvas style API", () => {
  it("GET without a file answers schematic-light (the default), no overrides, and the default style", async () => {
    const response = await send("GET", "/api/canvas-style");
    expect(response.status).toBe(200);
    expect(DEFAULT_CANVAS_STYLE.theme).toBe("schematic-light");
    expect(JSON.parse(response.text)).toEqual({
      settings: { theme: "schematic-light", themes: {} },
      style: { ...DEFAULT_CANVAS_STYLE, palette: { ...DEFAULT_CANVAS_STYLE.palette } },
      overrides: {},
      hash: null,
    });
  });

  it("a pre-theme file (flat numeric overrides) reads as figjam's overrides", async () => {
    writeFileSync(stylePath(), JSON.stringify({ shapeCornerRadiusPx: 8, connectorStrokeWidthPx: 3 }));
    const payload = JSON.parse((await send("GET", "/api/canvas-style")).text);
    expect(payload.settings).toEqual({
      theme: "figjam",
      themes: { figjam: { shapeCornerRadiusPx: 8, connectorStrokeWidthPx: 3 } },
    });
    expect(payload.overrides).toEqual({ shapeCornerRadiusPx: 8, connectorStrokeWidthPx: 3 });
    expect(payload.style).toEqual({ ...canvasThemePreset("figjam"), shapeCornerRadiusPx: 8, connectorStrokeWidthPx: 3 });
  });

  it("PUT { settings } persists only non-preset overrides per theme and reads back identically", async () => {
    const response = await send("PUT", "/api/canvas-style", {
      settings: {
        theme: "schematic-dark",
        themes: {
          "schematic-dark": {
            cardFill: "#30364a",
            sectionTintMax: 0.3,
            connectorStrokeWidthPx: 99, // clamps to the control max (8)
            headerUppercase: true, // the preset value: no override
            bogus: 1,
            palette: { red: "rgba(255,0,0,0.5)", blue: canvasThemePreset("schematic-dark").palette.blue },
          },
          // Only preset values and an invalid color: the theme drops out entirely.
          figjam: { shapeCornerRadiusPx: 2, textColor: "red" },
          "schematic-light": { headerPlacement: "floating" },
        },
      },
    });
    expect(response.status).toBe(200);
    const expected = {
      theme: "schematic-dark",
      themes: {
        "schematic-light": { headerPlacement: "floating" },
        // Control order (CANVAS_STYLE_CONTROLS), palette last.
        "schematic-dark": {
          cardFill: "#30364A",
          sectionTintMax: 0.3,
          connectorStrokeWidthPx: 8,
          palette: { red: "rgba(255, 0, 0, 0.5)" },
        },
      },
    };
    expect(readStyleFile()).toEqual(expected);
    // Pretty JSON with a trailing newline, keys in a stable order.
    expect(readFileSync(stylePath(), "utf8")).toBe(`${JSON.stringify(expected, null, 2)}\n`);

    const payload = JSON.parse(response.text);
    expect(payload.settings).toEqual(expected);
    expect(payload.overrides).toEqual(expected.themes["schematic-dark"]);
    // The active theme's preset with that theme's overrides — not figjam's or light's.
    const dark = canvasThemePreset("schematic-dark");
    expect(payload.style).toEqual({
      ...dark,
      cardFill: "#30364A",
      sectionTintMax: 0.3,
      connectorStrokeWidthPx: 8,
      palette: { ...dark.palette, red: "rgba(255, 0, 0, 0.5)" },
    });

    expect(JSON.parse((await send("GET", "/api/canvas-style")).text)).toEqual(payload);
  });

  it("PUT { settings } with a non-default theme and no overrides keeps the theme on disk", async () => {
    // figjam is no longer the default: choosing it must persist, or the next read falls back to schematic-light.
    await send("PUT", "/api/canvas-style", { settings: { theme: "figjam", themes: {} } });
    expect(readStyleFile()).toEqual({ theme: "figjam", themes: {} });
    const payload = JSON.parse((await send("GET", "/api/canvas-style")).text);
    expect(payload.settings).toEqual({ theme: "figjam", themes: {} });
    expect(payload.style).toEqual(canvasThemePreset("figjam"));
  });

  it("the legacy PUT { overrides } body replaces the ACTIVE theme's overrides and keeps the rest", async () => {
    await send("PUT", "/api/canvas-style", {
      settings: {
        theme: "schematic-light",
        themes: { figjam: { shapeCornerRadiusPx: 8 }, "schematic-light": { cardFill: "#FAFAFA" } },
      },
    });
    const response = await send("PUT", "/api/canvas-style", {
      overrides: { connectorStrokeWidthPx: 3, shapeBorderWidthPx: canvasThemePreset("schematic-light").shapeBorderWidthPx },
    });
    expect(response.status).toBe(200);
    expect(readStyleFile()).toEqual({
      theme: "schematic-light",
      themes: { figjam: { shapeCornerRadiusPx: 8 }, "schematic-light": { connectorStrokeWidthPx: 3 } },
    });
    expect(JSON.parse(response.text).style.connectorStrokeWidthPx).toBe(3);
  });

  it("PUT of the defaults (schematic-light, no overrides) deletes the file", async () => {
    await send("PUT", "/api/canvas-style", { settings: { theme: "schematic-dark", themes: {} } });
    expect(existsSync(stylePath())).toBe(true);
    const response = await send("PUT", "/api/canvas-style", { settings: { theme: "schematic-light", themes: {} } });
    expect(response.status).toBe(200);
    expect(existsSync(stylePath())).toBe(false);
    // The legacy body on a workspace without a file edits the active (default) theme, and an empty bag resets it.
    await send("PUT", "/api/canvas-style", { overrides: { shapeCornerRadiusPx: 8 } });
    expect(readStyleFile()).toEqual({
      theme: "schematic-light",
      themes: { "schematic-light": { shapeCornerRadiusPx: 8 } },
    });
    await send("PUT", "/api/canvas-style", { overrides: {} });
    expect(existsSync(stylePath())).toBe(false);
  });

  it("a PUT built on a stale baseHash (a second Studio tab) answers 409 with the file as it is now", async () => {
    // Both tabs load the same revision: no file yet.
    const loaded = JSON.parse((await send("GET", "/api/canvas-style")).text);
    expect(loaded.hash).toBeNull();
    const tabA = { theme: "schematic-dark", themes: { "schematic-dark": { sectionTintMax: 0.3 } } };
    const savedA = await send("PUT", "/api/canvas-style", { settings: tabA, baseHash: loaded.hash });
    expect(savedA.status).toBe(200);
    const revisionA = JSON.parse(savedA.text).hash;
    expect(revisionA).toBe(JSON.parse((await send("GET", "/api/canvas-style")).text).hash);

    // Tab B saves on top of what it loaded: refused, with A's revision to replay onto.
    const staleB = await send("PUT", "/api/canvas-style", {
      settings: { theme: "figjam", themes: { figjam: { shapeCornerRadiusPx: 6 } } },
      baseHash: loaded.hash,
    });
    expect(staleB.status).toBe(409);
    expect(JSON.parse(staleB.text)).toMatchObject({ settings: tabA, hash: revisionA });
    expect(readStyleFile()).toEqual(tabA);

    // Replayed onto A's revision, B's save lands.
    const merged = { theme: "schematic-dark", themes: { ...tabA.themes, figjam: { shapeCornerRadiusPx: 6 } } };
    const replayedB = await send("PUT", "/api/canvas-style", { settings: merged, baseHash: revisionA });
    expect(replayedB.status).toBe(200);
    expect(readStyleFile()).toEqual(merged);
  });

  it("PUT rejects a body with neither a settings nor an overrides object", async () => {
    expect((await send("PUT", "/api/canvas-style", { style: {} })).status).toBe(400);
    expect((await send("PUT", "/api/canvas-style", { overrides: [1] })).status).toBe(400);
    expect((await send("PUT", "/api/canvas-style", { settings: "schematic-dark" })).status).toBe(400);
  });

  it("a malformed file reads as the defaults", async () => {
    writeFileSync(stylePath(), "{ not json");
    const payload = JSON.parse((await send("GET", "/api/canvas-style")).text);
    expect(payload.settings).toEqual({ theme: "schematic-light", themes: {} });
    expect(payload.style).toEqual(canvasThemePreset("schematic-light"));
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

  it("a theme switch re-renders previews in the active theme and rotates their ETag", async () => {
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
    const darkBoard = canvasThemePreset("schematic-dark").boardBackground;
    const before = await send("GET", "/api/canvases/board-a/preview.svg");
    expect(before.status).toBe(200);
    expect(before.text.toLowerCase()).not.toContain(darkBoard.toLowerCase());
    await send("PUT", "/api/canvas-style", { settings: { theme: "schematic-dark", themes: {} } });
    const after = await send("GET", "/api/canvases/board-a/preview.svg");
    expect(after.status).toBe(200);
    expect(after.etag).toBeDefined();
    expect(after.etag).not.toBe(before.etag);
    expect(after.text.toLowerCase()).toContain(darkBoard.toLowerCase());
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
