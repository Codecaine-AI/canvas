import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  LayoutSessionStore,
  type LayoutSession,
} from "../src/harness/session-store";
import type { LayoutToolRenderResult } from "../src/harness/tool-runtime";
import { fitScope } from "../src/pipeline";
import { box, connect, makeDocument } from "./synthetic";

function invokePrivate<T>(store: LayoutSessionStore, name: string, ...args: unknown[]): T {
  const method = Reflect.get(store, name) as (...methodArgs: unknown[]) => T;
  return method.apply(store, args);
}

function makeSession(baseline: InteractiveCanvasDocument): LayoutSession {
  const fit = fitScope(baseline, ["task"]);
  return {
    id: "board-tool-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/board-tool.canvas.json",
    baseline,
    baselineHash: "test-hash",
    requestedScopeIds: ["task"],
    baselineFit: fit,
    currentFit: fit,
    scopeIds: new Set(fit.scopeObjectIds),
    draft: baseline,
    lastSketch: null,
    proposalCount: 0,
    proposal: null,
    status: "running",
    error: null,
    instruction: "Inspect the board",
    annotations: [],
    viewport: undefined,
    containerId: "board-tool-container",
    sessionDir: "/tmp/board-tool-session",
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

describe("board tool", () => {
  test("returns the digest plus diagnostics for the current draft", () => {
    const baseline = makeDocument([box("task", 0, 0, 192, 96, "process")]);
    const session = makeSession(baseline);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolRenderResult>(store, "toolBoard");

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain("BOARD · no locked frame");
    expect(result.text).toContain('  task  process  gray  "task"  0,0 192×96');
    expect(result.text).toContain("DIAGNOSTICS · clean");
    expect(result.details).toEqual({ errors: 0, warnings: 0 });
  });

  test("attaches the house exemplar PNG only to the first board call", () => {
    // Moved from fit_scope (v4 build spec item 3).
    const baseline = makeDocument([box("task", 0, 0, 192, 96, "process")]);
    const session = makeSession(baseline);
    const store = makeToolStore(session);

    const first = invokePrivate<LayoutToolRenderResult>(store, "toolBoard");
    const second = invokePrivate<LayoutToolRenderResult>(store, "toolBoard");

    expect(first.isError).not.toBe(true);
    expect(Buffer.isBuffer(first.png)).toBe(true);
    expect(first.png?.length ?? 0).toBeGreaterThan(0);
    expect(first.text).toContain("Reference board (house style)");
    expect(second.isError).not.toBe(true);
    expect(second.png).toBeUndefined();
    expect(second.text).not.toContain("Reference board (house style)");
    expect(session.exemplarShown).toBe(true);
  });

  test("fit_scope no longer carries the exemplar", () => {
    const baseline = makeDocument([box("task", 0, 0, 192, 96, "process")]);
    const session = makeSession(baseline);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolRenderResult>(store, "toolFitScope");

    expect(result.isError).not.toBe(true);
    expect(result.png).toBeUndefined();
    expect(result.text).not.toContain("Reference board (house style)");
    expect(session.exemplarShown).toBe(false);
  });

  test("surfaces diagnostics for a flawed draft", () => {
    const baseline = makeDocument([
      box("task", 0, 0, 192, 96, "process"),
      box("other", 240, 0, 192, 96, "process"),  // gap 48 — under the 128px label floor
    ], [{ ...connect("edge", "task", "other"), label: "go" }]);
    const session = makeSession(baseline);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolRenderResult>(store, "toolBoard");

    expect(result.text).toContain("DIAGNOSTICS · 0 errors · 1 warning");
    expect(result.text).toContain("W1 unreadable-labels: labeled edge task↔other: 48px gap is too tight");
    expect(result.details).toEqual({ errors: 0, warnings: 1 });
  });
});
