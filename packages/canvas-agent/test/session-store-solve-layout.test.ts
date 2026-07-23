import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  LayoutSessionStore,
  type LayoutSession,
} from "../src/harness/session-store";
import type { LayoutToolTextResult } from "../src/harness/tool-runtime";
import { fitScope, parseSketch } from "../src/pipeline";
import { box, connect, makeDocument } from "./synthetic";

const ONE_ITEM_PROGRAM = [
  "item 1 text=alpha type=process size=M at=C",
  "",
  "arrows",
].join("\n");

function invokePrivate<T>(store: LayoutSessionStore, name: string, ...args: unknown[]): T {
  const method = Reflect.get(store, name) as (...methodArgs: unknown[]) => T;
  return method.apply(store, args);
}

function makeSession(
  baseline: InteractiveCanvasDocument,
  requestedScopeIds: string[],
): LayoutSession {
  const fit = fitScope(baseline, requestedScopeIds);
  return {
    id: "solve-layout-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/solve-layout.canvas.json",
    baseline,
    baselineHash: "test-hash",
    requestedScopeIds,
    baselineFit: fit,
    currentFit: fit,
    scopeIds: new Set(fit.scopeObjectIds),
    draft: baseline,
    lastSketch: null,
    proposalCount: 0,
    proposal: null,
    status: "running",
    error: null,
    instruction: "Solve the selected layout",
    annotations: [],
    viewport: undefined,
    containerId: "solve-layout-container",
    sessionDir: "/tmp/solve-layout-session",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    exemplarShown: false,
  };
}

function makeToolStore(session: LayoutSession): LayoutSessionStore {
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  Object.defineProperty(store, "currentSession", { value: () => session });
  return store;
}

describe("solve_layout", () => {
  test("mode A echoes a program and legend for only the requested selection", () => {
    const baseline = makeDocument([
      box("alpha", 0, 0),
      box("beta", 320, 0),
      box("outside", 800, 0),
    ]);
    const session = makeSession(baseline, ["alpha", "beta"]);
    session.lastSketch = parseSketch(ONE_ITEM_PROGRAM);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolTextResult>(store, "toolSolveLayout", ["beta"]);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("Selection layout program:");
    expect(result.text).toContain("item 1 text=beta type=rectangle size=M at=C");
    expect(result.text).toContain('1. rectangle "beta" (id=beta, 160×96)');
    expect(result.text).not.toContain("text=alpha");
    expect(result.text).not.toContain("text=outside");
    expect(result.details?.objectIds).toEqual(["beta"]);
    expect(session.draft).toBe(baseline);
    expect(session.lastSketch).toBeNull();
  });

  test("mode B applies selected geometry only and never deletes omitted objects", () => {
    const alpha = {
      ...box("alpha", 0, 0),
      text: "Alpha label",
      color: "blue" as const,
      style: { strokeWidth: 6 },
    };
    const beta = {
      ...box("beta", 400, 0),
      text: "Beta label",
      color: "orange" as const,
    };
    const outside = {
      ...box("outside", 900, 0),
      text: "Outside label",
      color: "green" as const,
    };
    const connection = {
      ...connect("alpha-beta", "alpha", "beta"),
      label: "Keep this label",
      color: "violet" as const,
    };
    const baseline = makeDocument([alpha, beta, outside], [connection]);
    const session = makeSession(baseline, ["alpha", "beta"]);
    session.lastSketch = parseSketch(ONE_ITEM_PROGRAM);
    const store = makeToolStore(session);
    const betaBefore = { ...beta.geometry };
    const outsideBefore = { ...outside.geometry };

    const result = invokePrivate<LayoutToolTextResult>(
      store,
      "toolSolveLayout",
      ["alpha", "beta"],
      ONE_ITEM_PROGRAM,
    );

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("Placed geometry for 1 selected object: alpha.");
    expect(result.text).toContain("Not placed: beta.");
    expect(session.draft.objects.map((object) => object.id)).toEqual([
      "alpha",
      "beta",
      "outside",
    ]);

    const solvedAlpha = session.draft.objects.find((object) => object.id === "alpha")!;
    expect(solvedAlpha.geometry).not.toEqual(alpha.geometry);
    expect(solvedAlpha).toMatchObject({
      type: "rectangle",
      text: "Alpha label",
      color: "blue",
      style: { strokeWidth: 6 },
    });
    expect(session.draft.objects.find((object) => object.id === "beta")).toMatchObject({
      text: "Beta label",
      color: "orange",
      geometry: betaBefore,
    });
    expect(session.draft.objects.find((object) => object.id === "outside")).toMatchObject({
      text: "Outside label",
      color: "green",
      geometry: outsideBefore,
    });
    expect(session.draft.connections).toEqual([connection]);
    expect(session.lastSketch).toBeNull();
  });
});
