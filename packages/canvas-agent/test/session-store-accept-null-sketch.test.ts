import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  HttpError,
  LayoutSessionStore,
  type LayoutSession,
} from "../src/harness/session-store";
import type { LayoutToolTextResult } from "../src/harness/tool-runtime";
import { fitScope } from "../src/pipeline";
import { box, makeDocument } from "./synthetic";

const tempDir = mkdtempSync(join(tmpdir(), "canvas-agent-null-sketch-"));

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

function invokePrivate<T>(store: LayoutSessionStore, name: string, ...args: unknown[]): T {
  const method = Reflect.get(store, name) as (...methodArgs: unknown[]) => T;
  return method.apply(store, args);
}

function makeStore(
  id: string,
  canvasPath: string,
  baseline: InteractiveCanvasDocument,
  baselineRaw: string,
): { store: LayoutSessionStore; session: LayoutSession } {
  const fit = fitScope(baseline, ["task"]);
  const editedTask = {
    ...baseline.objects.find((object) => object.id === "task")!,
    text: "Edited task",
  };
  const session: LayoutSession = {
    id,
    canvasId: id,
    canvasPath,
    baseline,
    baselineHash: createHash("sha256").update(baselineRaw).digest("hex"),
    requestedScopeIds: ["task"],
    baselineFit: fit,
    currentFit: fit,
    scopeIds: new Set(fit.scopeObjectIds),
    draft: { ...baseline, objects: [editedTask] },
    lastSketch: null,
    proposalCount: 0,
    proposal: null,
    status: "running",
    error: null,
    instruction: "Rename the task",
    annotations: [],
    viewport: undefined,
    containerId: `${id}-container`,
    sessionDir: tempDir,
    events: [],
    subscribers: new Set(),
    runPromise: null,
    exemplarShown: false,
  };
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  Object.defineProperty(store, "currentSession", { value: () => session });
  (store as unknown as { sessions: Map<string, LayoutSession> }).sessions = new Map([
    [session.id, session],
  ]);
  return { store, session };
}

function commitDocumentDraft(store: LayoutSessionStore): LayoutToolTextResult {
  return invokePrivate<LayoutToolTextResult>(store, "toolCommit", "Renamed the task");
}

describe("accept with a null sketch", () => {
  test("returns the diffDocuments operations when the live file is unchanged", () => {
    const canvasPath = join(tempDir, "unchanged.canvas.json");
    const baseline = makeDocument([box("task", 0, 0, 184, 96, "process")]);
    const baselineRaw = JSON.stringify(baseline);
    writeFileSync(canvasPath, baselineRaw);
    const { store, session } = makeStore("unchanged", canvasPath, baseline, baselineRaw);

    const committed = commitDocumentDraft(store);

    expect(committed.isError).not.toBe(true);
    expect(session.lastSketch).toBeNull();
    expect(session.proposal?.operations).toEqual([
      { type: "updateObject", objectId: "task", patch: { text: "Edited task" } },
    ]);

    const accepted = store.accept(session.id);

    expect(accepted).toEqual({
      operations: [
        { type: "updateObject", objectId: "task", patch: { text: "Edited task" } },
      ],
      summary: "Renamed the task",
      rebased: false,
    });
    expect(session.status).toBe("accepted");
  });

  test("returns 409 when a scoped object moved in the live file", () => {
    const canvasPath = join(tempDir, "moved-scope.canvas.json");
    const task = box("task", 0, 0, 184, 96, "process");
    const baseline = makeDocument([task]);
    const baselineRaw = JSON.stringify(baseline);
    writeFileSync(canvasPath, baselineRaw);
    const { store, session } = makeStore("moved-scope", canvasPath, baseline, baselineRaw);
    expect(commitDocumentDraft(store).isError).not.toBe(true);

    const live = makeDocument([
      { ...task, geometry: { ...task.geometry, x: 64 } },
    ]);
    writeFileSync(canvasPath, JSON.stringify(live));

    try {
      store.accept(session.id);
      throw new Error("Expected accept to reject a moved scoped object.");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect((error as HttpError).status).toBe(409);
      expect((error as Error).message).toContain("objects in the agent's scope were moved or resized (task)");
    }
    expect(session.status).toBe("proposal-ready");
  });
});
