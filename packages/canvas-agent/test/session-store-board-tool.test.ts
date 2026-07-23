import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  createLayoutToolState,
  toolBoard,
  type LayoutSession,
} from "../src/service/session";
import { resolveScope } from "../src/board/scope";
import { box, connect, makeDocument } from "./synthetic";

function makeSession(baseline: InteractiveCanvasDocument): LayoutSession {
  const scopeResolution = resolveScope(baseline, ["task"]);
  return {
    id: "board-tool-session",
    canvasId: "synthetic",
    canvasPath: "/tmp/board-tool.canvas.json",
    baseline,
    baselineHash: "test-hash",
    scopeResolution,
    scopeIds: new Set(scopeResolution.scopeObjectIds),
    draft: baseline,
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

describe("board tool", () => {
  test("returns the digest plus diagnostics for the current draft", () => {
    const baseline = makeDocument([box("task", 0, 0, 192, 96, "process")]);
    const session = makeSession(baseline);
    const state = createLayoutToolState();

    const result = toolBoard(session, state);

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain("BOARD · no locked frame");
    expect(result.text).toContain('  task process "task" 0,0 192×96');
    expect(result.text).toContain("DIAGNOSTICS · clean");
    expect(result.details).toEqual({ errors: 0, warnings: 0 });
  });

  test("attaches the house exemplar PNG only to the first board call", () => {
    const baseline = makeDocument([box("task", 0, 0, 192, 96, "process")]);
    const session = makeSession(baseline);
    const state = createLayoutToolState();

    const first = toolBoard(session, state);
    const second = toolBoard(session, state);

    expect(first.isError).not.toBe(true);
    expect(Buffer.isBuffer(first.png)).toBe(true);
    expect(first.png?.length ?? 0).toBeGreaterThan(0);
    expect(first.text).toContain("Reference board (house style)");
    expect(second.isError).not.toBe(true);
    expect(second.png).toBeUndefined();
    expect(second.text).not.toContain("Reference board (house style)");
    expect(session.exemplarShown).toBe(true);
  });

  test("surfaces diagnostics for a flawed draft", () => {
    const baseline = makeDocument([
      box("task", 0, 0, 192, 96, "process"),
      box("other", 240, 0, 192, 96, "process"),  // gap 48 — under the "go" chip's 76px need
    ], [{ ...connect("edge", "task", "other"), label: "go" }]);
    const session = makeSession(baseline);
    const state = createLayoutToolState();

    const result = toolBoard(session, state);

    expect(result.text).toContain("DIAGNOSTICS · 0 errors · 1 warning");
    expect(result.text).toContain(
      'W1 unreadable-labels: label "go" chip on edge (43×30px) bleeds onto task and other',
    );
    expect(result.details).toEqual({ errors: 0, warnings: 1 });
  });
});
