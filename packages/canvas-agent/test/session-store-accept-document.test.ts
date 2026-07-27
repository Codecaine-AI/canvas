import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, test } from "bun:test";

import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "@codecaine-ai/canvas/actions";
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import {
  emitSessionEvent,
  HttpError,
  LayoutSessionStore,
  toolFinalize,
  type LayoutSession,
} from "../src/service/session";
import type { LayoutToolTextResult } from "../src/service/tool-runtime";
import { resolveScope } from "../src/board/scope";
import { box, makeDocument } from "./synthetic";

const tempDir = mkdtempSync(join(tmpdir(), "canvas-agent-document-accept-"));

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

function makeStore(
  id: string,
  canvasPath: string,
  baseline: InteractiveCanvasDocument,
  baselineRaw: string,
): { store: LayoutSessionStore; session: LayoutSession } {
  const scopeResolution = resolveScope(baseline, ["task"]);
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
    scopeResolution,
    scopeIds: new Set(scopeResolution.scopeObjectIds),
    draft: { ...baseline, objects: [editedTask] },
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
    requests: [],
    views: [],
    viewCount: 0,
  };
  const store = Object.create(LayoutSessionStore.prototype) as LayoutSessionStore;
  (store as unknown as { sessions: Map<string, LayoutSession> }).sessions = new Map([
    [session.id, session],
  ]);
  return { store, session };
}

function commitDocumentDraft(session: LayoutSession): LayoutToolTextResult {
  return toolFinalize(session, "committed", "Renamed the task", emitSessionEvent);
}

describe("document-patch accept", () => {
  test("returns the diffDocuments operations when the live file is unchanged", () => {
    const canvasPath = join(tempDir, "unchanged.canvas.json");
    const baseline = makeDocument([box("task", 0, 0, 184, 96, "process")]);
    const baselineRaw = JSON.stringify(baseline);
    writeFileSync(canvasPath, baselineRaw);
    const { store, session } = makeStore("unchanged", canvasPath, baseline, baselineRaw);

    const committed = commitDocumentDraft(session);

    expect(committed.isError).not.toBe(true);
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
    expect(commitDocumentDraft(session).isError).not.toBe(true);

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

describe("annotation threads through the accept path", () => {
  test("carries the thread operations to studio, where the reducer lands them", () => {
    const canvasPath = join(tempDir, "threads.canvas.json");
    const baseline = makeDocument([box("task", 0, 0, 184, 96, "process")]);
    baseline.annotations = [{
      id: "annotation-1",
      target: { kind: "object", objectId: "task" },
      intent: "agent-request",
      body: "Split this into two steps",
      status: "open",
      createdBy: "human",
      replies: [],
    }];
    const baselineRaw = JSON.stringify(baseline);
    writeFileSync(canvasPath, baselineRaw);
    const { store, session } = makeStore("threads", canvasPath, baseline, baselineRaw);
    session.draft = {
      ...session.draft,
      annotations: [
        {
          ...baseline.annotations[0]!,
          status: "applied",
          replies: [{ id: "reply-1", author: "agent", body: "Split into prep and run" }],
        },
        {
          id: "annotation-2",
          target: { kind: "object", objectId: "task" },
          intent: "agent-request",
          body: "Is this the retry path?",
          status: "open",
          createdBy: "agent",
          replies: [],
        },
      ],
    };

    expect(commitDocumentDraft(session).isError).not.toBe(true);
    const accepted = store.accept(session.id);

    expect(accepted.operations.map((operation) => operation.type)).toEqual([
      "updateObject",
      "appendAnnotationReply",
      "setAnnotationStatus",
      "addAnnotation",
    ]);

    const applied = reduceInteractiveCanvasState(
      createInteractiveCanvasState(baseline),
      {
        type: "canvas.applyAgentPatch",
        operations: accepted.operations as CanvasAgentPatchOperation[],
        summary: accepted.summary,
      },
    );

    expect(applied.document.annotations).toMatchObject([
      {
        id: "annotation-1",
        status: "applied",
        replies: [{ id: "reply-1", author: "agent", body: "Split into prep and run" }],
      },
      { id: "annotation-2", createdBy: "agent", status: "open", replies: [] },
    ]);
    expect(applied.lastChange?.changedAnnotationIds).toEqual([
      "annotation-1",
      "annotation-2",
    ]);
  });
});
