import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { rasterizeSvgToPng } from "../src/service/render";
import {
  createLayoutToolState,
  emitSessionEvent,
  LayoutSessionStore,
  toolApplyOps,
  toolRenderDraft,
  type LayoutSession,
  type LayoutToolState,
} from "../src/service/session";
import type {
  LayoutRenderRequest,
  LayoutToolRenderResult,
} from "../src/service/tool-runtime";
import { resolveScope } from "../src/board/scope";
import { FIXTURES_DIR } from "./helpers";

const PNG_SIGNATURE = "89504e470d0a1a0a";

function makeBubbaStore(): {
  store: LayoutSessionStore;
  session: LayoutSession;
  state: LayoutToolState;
} {
  const baseline = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "bubba-voice.canvas.json"), "utf8"),
  ) as InteractiveCanvasDocument;
  const scopeResolution = resolveScope(baseline, ["section-ml-pending"]);
  const session: LayoutSession = {
    id: "render-session",
    canvasId: "bubba-voice",
    canvasPath: join(FIXTURES_DIR, "bubba-voice.canvas.json"),
    baseline,
    baselineHash: "test-hash",
    scopeResolution,
    scopeIds: new Set(scopeResolution.scopeObjectIds),
    draft: baseline,
    proposalCount: 0,
    proposal: null,
    status: "running",
    error: null,
    instruction: "Nudge Task A to sit centered in the Pending lane.",
    annotations: [],
    viewport: undefined,
    containerId: "render-container",
    sessionDir: "/tmp/canvas-agent-render-test",
    events: [],
    subscribers: new Set(),
    runPromise: null,
  };

  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  (store as unknown as { sessions: Map<string, LayoutSession> }).sessions = new Map([
    [session.id, session],
  ]);
  return { store, session, state: createLayoutToolState() };
}

function centerTask(session: LayoutSession): LayoutToolRenderResult {
  return toolApplyOps(session, [{
    type: "updateObject",
    objectId: "task-ml-a",
    patch: { geometry: { x: 1116, y: 614, width: 200, height: 100 } },
  }], emitSessionEvent);
}

function renderDraft(
  session: LayoutSession,
  state: LayoutToolState,
  request: LayoutRenderRequest,
): LayoutToolRenderResult {
  return toolRenderDraft(session, request, emitSessionEvent, state);
}

function expectPng(png: Buffer | undefined): asserts png is Buffer {
  expect(png).toBeInstanceOf(Buffer);
  expect(png?.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
}

describe("harness render boundary", () => {
  test("renders the exact bubba-voice session draft and render_draft camera", () => {
    const { store, session, state } = makeBubbaStore();

    expect(centerTask(session).isError).not.toBe(true);
    expect(session.draft.objects.find((object) => object.id === "task-ml-a")?.geometry).toEqual({
      x: 1120,
      y: 608,
      width: 208,
      height: 96,
    });

    const ghost = store.draftSvg(session.id);
    expect({ width: ghost.width, height: ghost.height }).toEqual({ width: 1400, height: 778 });
    expect(ghost.svg).toContain('viewBox="784 352 864 480"');
    const ghostPng = rasterizeSvgToPng(ghost.svg);
    expect({ width: ghostPng.width, height: ghostPng.height }).toEqual({ width: 1400, height: 778 });
    expectPng(ghostPng.png);

    const rendered = renderDraft(session, state, { pixelWidth: 1000 });
    expect(rendered.isError).not.toBe(true);
    expect(rendered.details).toEqual({
      crop: { x: 784, y: 352, width: 864, height: 480 },
      width: 1000,
      height: 556,
    });
    expectPng(rendered.png);

    const secondRecordedWidth = renderDraft(session, state, { pixelWidth: 1200 });
    expect(secondRecordedWidth.isError).not.toBe(true);
    expect(secondRecordedWidth.details).toMatchObject({ width: 1200, height: 667 });
    expectPng(secondRecordedWidth.png);

    const closeUp = renderDraft(session, state, {
      crop: { x: 912, y: 480, width: 608, height: 160 },
      pixelWidth: 1000,
    });
    expect(closeUp.isError).not.toBe(true);
    expect(closeUp.details).toEqual({
      crop: { x: 912, y: 480, width: 608, height: 160 },
      width: 1000,
      height: 263,
    });
    expectPng(closeUp.png);
  });

  test("returns tool errors for degenerate crops and remains usable", () => {
    const { session, state } = makeBubbaStore();
    expect(centerTask(session).isError).not.toBe(true);
    const invalidRequests: LayoutRenderRequest[] = [
      { crop: { x: 0, y: 0, width: 0, height: 0 } },
      { crop: { x: 0, y: 0, width: -1, height: 10 } },
      { crop: { x: 0, y: 0, width: 10, height: -1 } },
      { crop: { x: 0, y: 0, width: Number.NaN, height: 10 } },
      { crop: { x: Number.POSITIVE_INFINITY, y: 0, width: 10, height: 10 } },
      { crop: { x: 0, y: 0, width: Number.MAX_VALUE, height: Number.MAX_VALUE } },
      { crop: { x: Number.MAX_VALUE, y: 0, width: 10, height: 10 } },
      { pixelWidth: Number.NaN },
    ];

    const renderingEventsBefore = session.events.filter(
      (event) => event.type === "rendering",
    ).length;
    for (const request of invalidRequests) {
      const result = renderDraft(session, state, request);
      expect(result.isError).toBe(true);
      expect(result.png).toBeUndefined();
    }
    expect(session.events.filter((event) => event.type === "rendering")).toHaveLength(
      renderingEventsBefore,
    );

    const recovered = renderDraft(session, state, { pixelWidth: 1000 });
    expect(recovered.isError).not.toBe(true);
    expectPng(recovered.png);
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
