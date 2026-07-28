import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { paintedBounds } from "@codecaine-ai/canvas/render";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { rasterizeSvgToPng } from "../src/service/render";
import {
  LayoutSessionStore,
  renderBoardView,
  renderSectionView,
  type LayoutSession,
} from "../src/service/session";
import { FIXTURES_DIR, look, makeTestSession, runOp } from "./helpers";

const PNG_SIGNATURE = "89504e470d0a1a0a";

function makeBubbaStore(): {
  store: LayoutSessionStore;
  session: LayoutSession;
} {
  const baseline = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "bubba-voice.canvas.json"), "utf8"),
  ) as InteractiveCanvasDocument;
  const session = makeTestSession(baseline, ["section-ml-pending"], {
    id: "render-session",
    canvasId: "bubba-voice",
    canvasPath: join(FIXTURES_DIR, "bubba-voice.canvas.json"),
    instruction: "Nudge Task A to sit centered in the Pending lane.",
  });

  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  (store as unknown as { sessions: Map<string, LayoutSession> }).sessions = new Map([
    [session.id, session],
  ]);
  return { store, session };
}

function centerTask(session: LayoutSession): ReturnType<typeof runOp> {
  return runOp(session, "move_to", { id: "task-ml-a", x: 1120, y: 620 });
}

function expectPng(png: Buffer | undefined): asserts png is Buffer {
  expect(png).toBeInstanceOf(Buffer);
  expect(png?.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
}

describe("harness render boundary", () => {
  test("look returns exactly the requested section close-up", () => {
    const { session } = makeBubbaStore();
    const draftBefore = session.draft;

    const result = look(session, "section-ml-pending");
    expect(result.isError).not.toBe(true);

    // The framed close-up is the one raster; the board rides the state block.
    expect(result.pngs).toHaveLength(1);
    expectPng(result.pngs![0]);
    expect(result.pngs![0]).toEqual(
      rasterizeSvgToPng(
        renderSectionView(session.draft, "section-ml-pending", { width: 1400 }).svg,
      ).png,
    );
    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });

  test("a mutator renders nothing; the close-up after it comes from look", () => {
    const { store, session } = makeBubbaStore();

    const result = centerTask(session);
    expect(result.isError).not.toBe(true);
    // A move carries the box whole: the corner lands on the agent's 20 grid and
    // the fixture's own size is untouched.
    expect(session.draft.objects.find((object) => object.id === "task-ml-a")?.geometry).toEqual({
      x: 1120,
      y: 620,
      width: 544,
      height: 64,
    });

    // An edit is text. The close-up is a separate, deliberate call.
    expect(result.pngs).toBeUndefined();

    const seen = look(session, "section-ml-pending");
    expect(seen.pngs).toHaveLength(1);
    expectPng(seen.pngs![0]);
    expect(seen.pngs![0]).toEqual(
      rasterizeSvgToPng(
        renderSectionView(session.draft, "section-ml-pending", { width: 1400 }).svg,
      ).png,
    );

    // Height/viewBox follow the moved task geometry above.
    const ghost = store.draftSvg(session.id);
    expect({ width: ghost.width, height: ghost.height }).toEqual({ width: 1400, height: 639 });
    expect(ghost.svg).toContain('viewBox="784 352 1008 460"');
    const ghostPng = rasterizeSvgToPng(ghost.svg);
    expect({ width: ghostPng.width, height: ghostPng.height }).toEqual({ width: 1400, height: 639 });
    expectPng(ghostPng.png);
  });

  test("renderBoardView frames the whole document at the requested width", () => {
    const { session } = makeBubbaStore();

    const view = renderBoardView(session.draft, { width: 1600 });

    expect(view.width).toBe(1600);
    expect(view.height).toBeGreaterThan(0);
    expect(view.camera.width).toBeGreaterThan(0);
    expect(view.camera.height).toBeGreaterThan(0);
    // Every object sits inside the camera rect.
    for (const object of session.draft.objects) {
      const { x, y, width, height } = object.geometry;
      expect(x).toBeGreaterThanOrEqual(view.camera.x);
      expect(y).toBeGreaterThanOrEqual(view.camera.y);
      expect(x + width).toBeLessThanOrEqual(view.camera.x + view.camera.width);
      expect(y + height).toBeLessThanOrEqual(view.camera.y + view.camera.height);
    }
    expectPng(rasterizeSvgToPng(view.svg).png);
  });

  test("the board-view camera covers the whole document's painted bounds", () => {
    const { session } = makeBubbaStore();

    const view = renderBoardView(session.draft, { width: 1600 });
    const painted = paintedBounds(session.draft);

    // Nothing painted — routed wires, label chips, title chips — is dropped.
    expect(view.camera.x).toBeLessThanOrEqual(painted.x);
    expect(view.camera.y).toBeLessThanOrEqual(painted.y);
    expect(view.camera.x + view.camera.width)
      .toBeGreaterThanOrEqual(painted.x + painted.width);
    expect(view.camera.y + view.camera.height)
      .toBeGreaterThanOrEqual(painted.y + painted.height);
  });

  test("renderSectionView frames the section and rejects unknown sections", () => {
    const { session } = makeBubbaStore();
    const section = session.draft.objects.find(
      (object) => object.id === "section-ml-pending",
    )!;

    const view = renderSectionView(session.draft, "section-ml-pending", { width: 1400 });

    expect(view.width).toBe(1400);
    // The camera covers the section frame (plus padding).
    expect(view.camera.x).toBeLessThanOrEqual(section.geometry.x);
    expect(view.camera.y).toBeLessThanOrEqual(section.geometry.y);
    expect(view.camera.x + view.camera.width)
      .toBeGreaterThanOrEqual(section.geometry.x + section.geometry.width);
    expect(view.camera.y + view.camera.height)
      .toBeGreaterThanOrEqual(section.geometry.y + section.geometry.height);
    expectPng(rasterizeSvgToPng(view.svg).png);

    expect(() => renderSectionView(session.draft, "no-such-section", { width: 1400 }))
      .toThrow('"no-such-section" is not a section');
  });

  test("rejects off-viewport clip geometry before entering resvg", () => {
    const svg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="481" viewBox="784 352 864 416">',
      '<defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">',
      '<feDropShadow dx="0" dy="6" stdDeviation="10"/></filter></defs>',
      '<rect x="3184" y="432" width="352" height="320" filter="url(#shadow)"/>',
      "</svg>",
    ].join("");
    const renderModuleUrl = new URL("../src/service/render.ts", import.meta.url).href;
    const probe = [
      `import { rasterizeSvgToPng } from ${JSON.stringify(renderModuleUrl)};`,
      `const svg = ${JSON.stringify(svg)};`,
      "try {",
      "  rasterizeSvgToPng(svg);",
      "  console.error('dangerous SVG unexpectedly rendered');",
      "  process.exit(2);",
      "} catch (error) {",
      "  console.log(error instanceof Error ? error.message : String(error));",
      "}",
    ].join("\n");
    const child = Bun.spawnSync({
      cmd: [process.execPath, "-e", probe],
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(child.exitCode).toBe(0);
    expect(child.stdout.toString()).toContain("off-viewport filtered element");
  });

  test("normalizes safe raster dimensions and still produces PNGs", () => {
    const normal = rasterizeSvgToPng(
      '<svg xmlns="http://www.w3.org/2000/svg" width="10.4" height="5.6" viewBox="0 0 10 6"><rect width="10" height="6"/></svg>',
    );
    expect({ width: normal.width, height: normal.height }).toEqual({ width: 10, height: 6 });
    expectPng(normal.png);

    const clamped = rasterizeSvgToPng(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1000000000000" height="2" '
      + 'viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
    );
    expect({ width: clamped.width, height: clamped.height }).toEqual({ width: 4096, height: 2 });
    expectPng(clamped.png);

    for (const dimensions of ['width="0" height="10"', 'width="10" height="NaN"']) {
      expect(() => rasterizeSvgToPng(`<svg ${dimensions} viewBox="0 0 1 1"/>`)).toThrow(
        "finite positive pixel lengths",
      );
    }
  });
});
