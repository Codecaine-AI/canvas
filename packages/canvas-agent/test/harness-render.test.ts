import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { rasterizeSvgToPng } from "../src/harness/render";
import {
  LayoutSessionStore,
  type LayoutSession,
} from "../src/harness/session-store";
import type {
  LayoutRenderRequest,
  LayoutToolRenderResult,
  LayoutToolTextResult,
} from "../src/harness/tool-runtime";
import { fitScope } from "../src/pipeline";
import { FIXTURES_DIR } from "./helpers";

const PNG_SIGNATURE = "89504e470d0a1a0a";
const CENTER_TASK_PROGRAM = [
  "section 1 text=section-ml-pending label=\"Pending\"",
  "  item 2 text=task-ml-a type=predefined-process size=M at=C",
  "",
  "align x: \"icon-conversation-history\" 2 \"task-ml-b\" \"task-ml-c\" \"task-ml-d\" \"task-ml-e\"",
  "",
  "arrows",
].join("\n");

function invokePrivate<T>(store: LayoutSessionStore, name: string, ...args: unknown[]): T {
  const method = Reflect.get(store, name) as (...methodArgs: unknown[]) => T;
  return method.apply(store, args);
}

function makeBubbaStore(): { store: LayoutSessionStore; session: LayoutSession } {
  const baseline = JSON.parse(
    readFileSync(join(FIXTURES_DIR, "bubba-voice.canvas.json"), "utf8"),
  ) as InteractiveCanvasDocument;
  const fit = fitScope(baseline, ["section-ml-pending"]);
  const session: LayoutSession = {
    id: "render-session",
    canvasId: "bubba-voice",
    canvasPath: join(FIXTURES_DIR, "bubba-voice.canvas.json"),
    baseline,
    baselineHash: "test-hash",
    requestedScopeIds: ["section-ml-pending"],
    baselineFit: fit,
    currentFit: fit,
    scopeIds: new Set(fit.scopeObjectIds),
    draft: baseline,
    lastSketch: null,
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
  Object.defineProperty(store, "currentSession", { value: () => session });
  (store as unknown as { sessions: Map<string, LayoutSession> }).sessions = new Map([
    [session.id, session],
  ]);
  (store as unknown as { renderCount: number }).renderCount = 0;
  store.onRender = null;
  return { store, session };
}

function proposeCenteredTask(store: LayoutSessionStore): LayoutToolTextResult {
  return invokePrivate(store, "toolProposeProgram", CENTER_TASK_PROGRAM);
}

function renderDraft(store: LayoutSessionStore, request: LayoutRenderRequest): LayoutToolRenderResult {
  return invokePrivate(store, "toolRenderDraft", request);
}

function expectPng(png: Buffer | undefined): asserts png is Buffer {
  expect(png).toBeInstanceOf(Buffer);
  expect(png?.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
}

describe("harness render boundary", () => {
  test("renders the exact bubba-voice session draft and render_draft camera", () => {
    const { store, session } = makeBubbaStore();

    expect(proposeCenteredTask(store).isError).not.toBe(true);
    expect(session.draft.objects.find((object) => object.id === "task-ml-a")?.geometry).toEqual({
      x: 1116,
      y: 614,
      width: 200,
      height: 100,
    });

    const ghost = store.draftSvg(session.id);
    expect({ width: ghost.width, height: ghost.height }).toEqual({ width: 1400, height: 907 });
    expect(ghost.svg).toContain('viewBox="784 352 864 560"');
    const ghostPng = rasterizeSvgToPng(ghost.svg);
    expect({ width: ghostPng.width, height: ghostPng.height }).toEqual({ width: 1400, height: 907 });
    expectPng(ghostPng.png);

    const rendered = renderDraft(store, { pixelWidth: 1000 });
    expect(rendered.isError).not.toBe(true);
    expect(rendered.details).toEqual({
      crop: { x: 784, y: 352, width: 864, height: 560 },
      width: 1000,
      height: 648,
    });
    expectPng(rendered.png);

    const secondRecordedWidth = renderDraft(store, { pixelWidth: 1200 });
    expect(secondRecordedWidth.isError).not.toBe(true);
    expect(secondRecordedWidth.details).toMatchObject({ width: 1200, height: 778 });
    expectPng(secondRecordedWidth.png);

    const closeUp = renderDraft(store, {
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
    const { store, session } = makeBubbaStore();
    expect(proposeCenteredTask(store).isError).not.toBe(true);
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
      const result = renderDraft(store, request);
      expect(result.isError).toBe(true);
      expect(result.png).toBeUndefined();
    }
    expect(session.events.filter((event) => event.type === "rendering")).toHaveLength(
      renderingEventsBefore,
    );

    const recovered = renderDraft(store, { pixelWidth: 1000 });
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
    const renderModuleUrl = new URL("../src/harness/render.ts", import.meta.url).href;
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
