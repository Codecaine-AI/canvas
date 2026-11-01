/**
 * The two workflow tools of S3.7 — `reply_annotation` and `set_board_title`.
 *
 * They are hand-written rather than operation descriptors because neither one
 * edits board geometry, so what has to be pinned is different: for
 * reply_annotation, that saying something is NOT disposing something; for
 * set_board_title, that the rename survives the whole commit path — draft →
 * diff → patch op → the live reducer — since before this slice there was no
 * patch op for a title at all and the change died at finalize.
 */
import { describe, expect, test } from "bun:test";

import { createInteractiveCanvasState } from "@codecaine-ai/canvas/actions";
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";
import type { InteractiveCanvasAnnotation } from "@codecaine-ai/canvas/schema";

import { handleApplyAgentPatch } from "../../canvas/src/state/actions/agent-patch";
import { diffDocuments } from "../src/board/doc-diff";
import {
  boardDiffBlock,
  describePatchOperation,
  emitSessionEvent,
  syncSessionRequests,
  toolFinalize,
  toolReplyAnnotation,
  toolResolveRequest,
  toolSetBoardTitle,
  type LayoutSession,
} from "../src/service/session";
import { makeTestSession } from "./helpers";
import { box, makeDocument } from "./synthetic";

function sessionWithThread(): LayoutSession {
  const baseline = makeDocument([box("task", 0, 0), box("other", 320, 0)]);
  baseline.annotations = [
    {
      id: "doc-1",
      target: { kind: "object", objectId: "task" },
      intent: "agent-request",
      status: "open",
      body: "Split this into two steps",
      createdBy: "human",
      replies: [],
    },
  ] satisfies InteractiveCanvasAnnotation[];
  const session = makeTestSession(baseline, ["task"]);
  syncSessionRequests(session);
  return session;
}

function threadOf(session: LayoutSession, id: string): InteractiveCanvasAnnotation {
  const found = session.draft.annotations?.find((annotation) => annotation.id === id);
  if (!found) throw new Error(`no thread ${id} on the draft`);
  return found;
}

describe("reply_annotation", () => {
  test("appends an agent reply and leaves the thread open", () => {
    const session = sessionWithThread();

    const result = toolReplyAnnotation(
      session,
      "R1",
      "Splitting it now — the second step lands next.",
      emitSessionEvent,
    );

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · reply_annotation doc-1");
    const thread = threadOf(session, "doc-1");
    expect(thread.replies).toHaveLength(1);
    expect(thread.replies[0]!.author).toBe("agent");
    expect(thread.replies[0]!.body).toBe("Splitting it now — the second step lands next.");
    // The whole point of the split from resolve_request: status does not move.
    expect(thread.status).toBe("open");
    expect(session.requests[0]!.status).toBe("open");
    expect(session.requests[0]!.note).toBeUndefined();
  });

  test("the reply shows in the REQUESTS block the result returns", () => {
    const session = sessionWithThread();

    const result = toolReplyAnnotation(session, "doc-1", "On it.", emitSessionEvent);

    expect(result.text).toContain("REQUESTS · 0/1 disposed");
    expect(result.text).toContain('↳ agent — "On it."');
    // The queue entry carries the reply too, so the live <requests> block does.
    expect(session.requests[0]!.replies.map((reply) => reply.body)).toEqual(["On it."]);
  });

  test("replies stack, and resolve_request still closes the thread afterwards", () => {
    const session = sessionWithThread();

    toolReplyAnnotation(session, "R1", "First", emitSessionEvent);
    toolReplyAnnotation(session, "R1", "Second", emitSessionEvent);
    expect(threadOf(session, "doc-1").replies.map((reply) => reply.body))
      .toEqual(["First", "Second"]);
    // Reply ids are minted against the thread's own replies, so they are unique.
    expect(new Set(threadOf(session, "doc-1").replies.map((reply) => reply.id)).size).toBe(2);

    const closed = toolResolveRequest(session, "R1", "done", "Split into two", emitSessionEvent);
    expect(closed.isError).toBeUndefined();
    expect(threadOf(session, "doc-1").status).toBe("applied");
    expect(threadOf(session, "doc-1").replies).toHaveLength(3);
  });

  test("an empty body, and a thread that is not on the board, are rejected", () => {
    const session = sessionWithThread();
    const before = session.draft;

    expect(toolReplyAnnotation(session, "R1", "   ", emitSessionEvent).isError).toBe(true);
    const missing = toolReplyAnnotation(session, "R9", "hello", emitSessionEvent);
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain('no thread "R9"');
    expect(missing.text).toContain("REQUESTS ·");
    expect(session.draft).toBe(before);
  });

  test("the appended reply commits as an appendAnnotationReply op", () => {
    const session = sessionWithThread();
    toolReplyAnnotation(session, "R1", "Noted", emitSessionEvent);

    const operations = diffDocuments(session.baseline, session.draft);

    expect(operations).toHaveLength(1);
    expect(operations[0]!.type).toBe("appendAnnotationReply");
    // No status op rides along — replying is not disposing.
    expect(operations.some((operation) => operation.type === "setAnnotationStatus")).toBe(false);
  });
});

describe("set_board_title", () => {
  test("renames the draft and reports the delta", () => {
    const session = makeTestSession(makeDocument([box("a", 0, 0)]), ["a"]);

    const result = toolSetBoardTitle(session, "  Onboarding flow  ", emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · set_board_title");
    expect(result.text).toContain('DELTA · title "Synthetic" → "Onboarding flow"');
    // Trimmed, matching the human reducer.
    expect(session.draft.title).toBe("Onboarding flow");
    expect(session.events.map((event) => event.type)).toEqual(["proposal", "delta"]);
  });

  test("an empty title is rejected and an identical one is a no-op", () => {
    const session = makeTestSession(makeDocument([box("a", 0, 0)]), ["a"]);

    const empty = toolSetBoardTitle(session, "   ", emitSessionEvent);
    expect(empty.isError).toBe(true);
    expect(empty.text).toContain("never left nameless");

    const same = toolSetBoardTitle(session, "Synthetic", emitSessionEvent);
    expect(same.isError).toBeUndefined();
    expect(same.text).toContain("NO-OP · set_board_title");
    expect(session.events).toEqual([]);
  });

  test("the rename diffs as an updateTitle op, ahead of the entity ops", () => {
    const baseline = makeDocument([box("a", 0, 0)]);
    const draft = { ...makeDocument([{ ...box("a", 0, 0), text: "After" }]), title: "Renamed" };

    expect(diffDocuments(baseline, draft)).toEqual([
      { type: "updateTitle", title: "Renamed" },
      { type: "updateObject", objectId: "a", patch: { text: "After" } },
    ]);
  });

  test("the diff block and the commit delta both name the rename", () => {
    const session = makeTestSession(makeDocument([box("a", 0, 0)]), ["a"]);
    toolSetBoardTitle(session, "Renamed", emitSessionEvent);

    expect(boardDiffBlock(session)).toContain('updateTitle  "Renamed"');
    expect(describePatchOperation({ type: "updateTitle", title: "Renamed" }))
      .toBe('updateTitle "Renamed"');
  });

  test("the rename survives a commit replay through canvas.applyAgentPatch", () => {
    const session = makeTestSession(makeDocument([box("a", 0, 0)]), ["a"]);
    toolSetBoardTitle(session, "Onboarding flow", emitSessionEvent);

    const committed = toolFinalize(session, "committed", "Renamed the board", emitSessionEvent);
    expect(committed.isError).toBeUndefined();
    const operations = session.proposal!.operations;
    expect(operations).toEqual([{ type: "updateTitle", title: "Onboarding flow" }]);

    // Studio replays the committed ops through the live reducer on accept —
    // which is the step the title used to die at, for want of a patch op.
    const state = createInteractiveCanvasState(session.baseline);
    const next = handleApplyAgentPatch(state, {
      type: "canvas.applyAgentPatch",
      // The protocol mirrors the canvas union structurally; the wire boundary
      // (studio's toCanvasOperation) is what re-narrows it in production.
      operations: operations as CanvasAgentPatchOperation[],
    });
    expect(next.document.title).toBe("Onboarding flow");
    expect(next.document).not.toBe(state.document);
  });

  test("the reducer refuses an empty rename and no-ops an unchanged one", () => {
    const state = createInteractiveCanvasState(makeDocument([box("a", 0, 0)]));

    const emptied = handleApplyAgentPatch(state, {
      type: "canvas.applyAgentPatch",
      operations: [{ type: "updateTitle", title: "   " }],
    });
    expect(emptied).toBe(state);

    const unchanged = handleApplyAgentPatch(state, {
      type: "canvas.applyAgentPatch",
      operations: [{ type: "updateTitle", title: "Synthetic" }],
    });
    expect(unchanged).toBe(state);
  });
});
