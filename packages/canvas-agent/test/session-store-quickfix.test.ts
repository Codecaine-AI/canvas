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
    id: "quickfix-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/quickfix.canvas.json",
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
    instruction: "Tidy the spacing",
    annotations: [],
    viewport: undefined,
    containerId: "quickfix-container",
    sessionDir: "/tmp/quickfix-session",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    exemplarShown: true,
    lastDiagnostics: undefined,
  };
}

function makeToolStore(session: LayoutSession): LayoutSessionStore {
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  Object.defineProperty(store, "currentSession", { value: () => session });
  return store;
}

describe("apply_quickfix", () => {
  test("applies an unreadable-labels quickfix through the shared operation path", () => {
    // Labeled pair 44px apart — far under the 128px breathing floor.
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 204, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "X" }],
    );
    const session = makeSession(baseline, ["alpha", "beta"]);
    session.lastSketch = parseSketch(ONE_ITEM_PROGRAM);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolTextResult>(store, "toolApplyQuickfix", "W1");

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · quickfix W1 (unreadable-labels) · 1 op");
    expect(result.text).toContain("1. updateObject beta");
    // First apply of the session: full-list behavior (clean here).
    expect(result.text).toContain("DIAGNOSTICS · clean");
    expect(session.draft.objects.find((object) => object.id === "beta")?.geometry.x).toBe(288);
    expect(session.lastSketch).toBeNull();
    expect(session.events.map((event) => event.type)).toEqual(["proposal", "delta"]);
    expect(result.details).toEqual({ diagnosticId: "W1", operations: 1 });
  });

  test("rejects an id that is not on the current draft", () => {
    const baseline = makeDocument([box("alpha", 0, 0), box("beta", 224, 0)]);
    const session = makeSession(baseline, ["alpha", "beta"]);
    const store = makeToolStore(session);
    const draftBefore = session.draft;

    const result = invokePrivate<LayoutToolTextResult>(store, "toolApplyQuickfix", "W7");

    expect(result.isError).toBe(true);
    expect(result.text).toContain('no diagnostic "W7" on the current draft');
    expect(result.text).toContain("Ids reset");
    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });

  test("rejects a diagnostic whose rule offers no quickfix", () => {
    const section = box("section", 0, 0, 480, 320, "section");
    const child = { ...box("child", 80, 96, 184, 96, "process"), parentId: "section" };
    const baseline = makeDocument([section, child]);
    const session = makeSession(baseline, ["section"]);
    session.draft = makeDocument([
      section,
      { ...child, geometry: { ...child.geometry, x: 400 } },
    ]);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolTextResult>(store, "toolApplyQuickfix", "E1");

    expect(result.isError).toBe(true);
    expect(result.text).toContain("E1 (containment) offers no quickfix");
    expect(session.events).toEqual([]);
  });

  test("rejects a blank diagnostic id", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeSession(baseline, ["alpha"]);
    const store = makeToolStore(session);

    const result = invokePrivate<LayoutToolTextResult>(store, "toolApplyQuickfix", "  ");

    expect(result.isError).toBe(true);
    expect(result.text).toContain("diagnosticId must be a non-empty string");
  });
});
