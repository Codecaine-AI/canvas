import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  LayoutSessionStore,
  type LayoutSession,
} from "../src/harness/session-store";
import type { LayoutToolTextResult } from "../src/harness/tool-runtime";
import { fitScope } from "../src/pipeline";
import { box, connect, makeDocument } from "./synthetic";

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
    id: "doc-commit-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/doc-commit.canvas.json",
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
    instruction: "Edit the board",
    annotations: [],
    viewport: undefined,
    containerId: "doc-commit-container",
    sessionDir: "/tmp/doc-commit-session",
    events: [],
    subscribers: new Set(),
    runPromise: null,
    exemplarShown: false,
    lastDiagnostics: undefined,
  };
}

function makeToolStore(session: LayoutSession): LayoutSessionStore {
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  Object.defineProperty(store, "currentSession", { value: () => session });
  return store;
}

function expectBlocked(result: LayoutToolTextResult, session: LayoutSession, detail: string): void {
  expect(result.isError).toBe(true);
  expect(result.text).toContain("Commit blocked");
  expect(result.text).toContain(detail);
  expect(session.status).toBe("running");
  expect(session.proposal).toBeNull();
  expect(session.events).toHaveLength(0);
}

describe("document-path commit gate (v4: error-tier diagnostics)", () => {
  test("blocks a parentId child that escapes its section", () => {
    const section = { ...box("section", 0, 0, 480, 320, "section"), text: "Section" };
    const child = { ...box("child", 80, 96, 184, 96, "process"), parentId: "section" };
    const baseline = makeDocument([section, child]);
    const session = makeSession(baseline, ["section"]);
    session.draft = makeDocument([
      section,
      { ...child, geometry: { ...child.geometry, x: 400 } },
    ]);

    const result = invokePrivate<LayoutToolTextResult>(
      makeToolStore(session),
      "toolCommit",
      "Escaped child should fail",
    );

    expectBlocked(result, session, "E1 containment: child extends 104px outside its section section");
  });

  test("blocks overflow beyond a locked background frame", () => {
    const frame = {
      ...box("page", 0, 0, 640, 480, "section"),
      locked: "background" as const,
    };
    const card = box("card", 96, 96, 184, 96, "process");
    const baseline = makeDocument([frame, card]);
    const session = makeSession(baseline, ["card"]);
    session.draft = makeDocument([
      frame,
      { ...card, geometry: { ...card.geometry, x: 600 } },
    ]);

    const result = invokePrivate<LayoutToolTextResult>(
      makeToolStore(session),
      "toolCommit",
      "Overflow should fail",
    );

    expectBlocked(result, session, "card extends 144px past the locked frame page");
  });

  test("warnings never block; unresolved ones ride on the proposal", () => {
    const labeled = [{ ...connect("edge", "a", "b"), label: "go" }];
    const baseline = makeDocument([
      box("a", 0, 0, 192, 96, "process"),
      box("b", 416, 0, 192, 96, "process"),  // gap 224 — clean baseline
    ], labeled);
    const session = makeSession(baseline, ["a", "b"]);
    session.draft = makeDocument([
      box("a", 0, 0, 192, 96, "process"),
      box("b", 288, 0, 192, 96, "process"),  // gap 96 — unreadable-labels warning
    ], labeled);

    const result = invokePrivate<LayoutToolTextResult>(
      makeToolStore(session),
      "toolCommit",
      "Ship with a named warning",
    );

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("Committed:");
    expect(session.status).toBe("proposal-ready");
    expect(session.proposal).not.toBeNull();
    expect(session.proposal!.lint).toContain("W1 unreadable-labels:");
    expect(session.proposal!.lint).toContain("96px gap is too tight");
  });

  test("error-tier findings outside the scope do not block", () => {
    // A pre-existing escaped child the session was never asked to touch.
    const section = box("section", 600, 600, 480, 320, "section");
    const escaped = { ...box("escaped", 1000, 700, 184, 96, "process"), parentId: "section" };
    const task = box("task", 0, 0, 184, 96, "process");
    const baseline = makeDocument([section, escaped, task]);
    const session = makeSession(baseline, ["task"]);
    session.draft = makeDocument([
      section,
      escaped,
      { ...task, text: "renamed task" },
    ]);

    const result = invokePrivate<LayoutToolTextResult>(
      makeToolStore(session),
      "toolCommit",
      "Renamed the task",
    );

    expect(result.isError).toBeUndefined();
    expect(session.status).toBe("proposal-ready");
    expect(session.proposal!.operations).toHaveLength(1);
  });

  test("apply_ops surfaces diagnostics without blocking the edit", () => {
    const baseline = makeDocument([
      box("a", 0, 0, 160, 96, "process"),
      box("b", 320, 0, 160, 96, "process"),
    ], [{ ...connect("edge", "a", "b"), label: "go" }]);
    const session = makeSession(baseline, ["a", "b"]);

    const result = invokePrivate<LayoutToolTextResult>(
      makeToolStore(session),
      "toolApplyOps",
      [{
        type: "updateObject",
        objectId: "b",
        patch: { geometry: { x: 208, y: 0, width: 160, height: 96 } },
      }],
    );

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain("APPLIED · 1 op");
    expect(result.text).toContain("DELTA");
    expect(result.text).toContain("DIAGNOSTICS · 0 errors · 1 warning");
    expect(result.text).toContain('labeled edge a↔b: 48px gap is too tight for its "go" chip');
    expect(session.draft.objects.find((object) => object.id === "b")?.geometry.x).toBe(208);
    expect(session.status).toBe("running");
    expect(session.proposal).toBeNull();
  });
});
