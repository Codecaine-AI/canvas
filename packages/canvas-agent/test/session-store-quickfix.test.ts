import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  emitSessionEvent,
  toolApplyQuickfix,
  type LayoutSession,
} from "../src/service/session";
import { resolveScope } from "../src/board/scope";
import { box, connect, makeDocument } from "./synthetic";

function makeSession(
  baseline: InteractiveCanvasDocument,
  requestedScopeIds: string[],
): LayoutSession {
  const scopeResolution = resolveScope(baseline, requestedScopeIds);
  return {
    id: "quickfix-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/quickfix.canvas.json",
    baseline,
    baselineHash: "test-hash",
    scopeResolution,
    scopeIds: new Set(scopeResolution.scopeObjectIds),
    draft: baseline,
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

describe("apply_quickfix", () => {
  test("applies an unreadable-labels quickfix through the shared operation path", () => {
    // Labeled pair 44px apart — the 41px "X" chip plus its 16px margins
    // needs 73px, so the rendered chip bleeds onto both boxes. The quickfix
    // widens by the deficit (29) and lands on the 16px grid: beta 204 → 240.
    const baseline = makeDocument(
      [box("alpha", 0, 0), box("beta", 204, 0)],
      [{ ...connect("edge", "alpha", "beta"), label: "X" }],
    );
    const session = makeSession(baseline, ["alpha", "beta"]);

    const result = toolApplyQuickfix(session, "W1", emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · quickfix W1 (unreadable-labels) · 1 op");
    expect(result.text).toContain("1. updateObject beta");
    // First apply of the session: full-list behavior (clean here).
    expect(result.text).toContain("DIAGNOSTICS · clean");
    expect(session.draft.objects.find((object) => object.id === "beta")?.geometry.x).toBe(240);
    expect(session.events.map((event) => event.type)).toEqual(["proposal", "delta"]);
    expect(result.details).toEqual({ diagnosticId: "W1", operations: 1 });
  });

  test("rejects an id that is not on the current draft", () => {
    const baseline = makeDocument([box("alpha", 0, 0), box("beta", 224, 0)]);
    const session = makeSession(baseline, ["alpha", "beta"]);
    const draftBefore = session.draft;

    const result = toolApplyQuickfix(session, "W7", emitSessionEvent);

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

    const result = toolApplyQuickfix(session, "E1", emitSessionEvent);

    expect(result.isError).toBe(true);
    expect(result.text).toContain("E1 (containment) offers no quickfix");
    expect(session.events).toEqual([]);
  });

  test("rejects a blank diagnostic id", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeSession(baseline, ["alpha"]);

    const result = toolApplyQuickfix(session, "  ", emitSessionEvent);

    expect(result.isError).toBe(true);
    expect(result.text).toContain("diagnosticId must be a non-empty string");
  });
});
