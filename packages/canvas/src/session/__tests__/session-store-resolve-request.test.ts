import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasAnnotation } from "@codecaine-ai/canvas/schema";

import {
  emitSessionEvent,
  syncSessionRequests,
  toolAddAnnotation,
  toolFinalize,
  toolResolveRequest,
  userRequestsSnapshot,
  type LayoutSession,
} from "../src/service/session";
import { USER_REQUESTS_EMPTY } from "../src/service/session/snapshots/user-requests";
import type { AgentSessionAnnotation } from "../src/protocol";
import { makeTestSession, runOp } from "./helpers";
import { box, makeDocument } from "./synthetic";

function invokeRequest(id: string, objectId: string, body: string): AgentSessionAnnotation {
  return {
    id,
    intent: "agent-request",
    body,
    target: { kind: "object", objectId },
  };
}

function sessionWithQueue(): LayoutSession {
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
  const session = makeTestSession(baseline, ["task"], {
    annotations: [
      // Collides with the document annotation — the document wins.
      invokeRequest("doc-1", "task", "Stale invoke copy"),
      invokeRequest("inv-1", "other", "Recolor the other box"),
    ],
  });
  syncSessionRequests(session);
  return session;
}

describe("request queue lifecycle", () => {
  test("merges document and invoke annotations (document wins) into open R-entries", () => {
    const session = sessionWithQueue();

    expect(session.requests.map((entry) => [entry.alias, entry.annotationId, entry.status]))
      .toEqual([
        ["R1", "doc-1", "open"],
        ["R2", "inv-1", "open"],
      ]);
    expect(session.requests[0]!.body).toBe("Split this into two steps");
  });

  test("boot block renders compact status-bearing lines and an empty marker", () => {
    const session = sessionWithQueue();

    const snapshot = userRequestsSnapshot(session);
    expect(snapshot).toContain('R1 open  object:task  human — "Split this into two steps"');
    expect(snapshot).toContain('R2 open  object:other  human — "Recolor the other box"');

    const empty = makeTestSession(makeDocument([box("solo", 0, 0)]), ["solo"]);
    syncSessionRequests(empty);
    expect(userRequestsSnapshot(empty)).toBe(USER_REQUESTS_EMPTY);
  });

  test("re-sync preserves statuses and appends new requests with the next alias", () => {
    const session = sessionWithQueue();
    session.requests[0]!.status = "done";
    session.requests[0]!.note = "split it";

    session.annotations = [
      ...session.annotations,
      invokeRequest("inv-2", "task", "Also add a legend"),
    ];
    syncSessionRequests(session);

    expect(session.requests.map((entry) => [entry.alias, entry.status])).toEqual([
      ["R1", "done"],
      ["R2", "open"],
      ["R3", "open"],
    ]);
    expect(userRequestsSnapshot(session)).toContain('R1 done "split it"');
  });
});

describe("resolve_request", () => {
  test("disposes an open entry and returns only the updated REQUESTS block", () => {
    const session = sessionWithQueue();

    const result = toolResolveRequest(
      session,
      "R1",
      "done",
      "Split into prep and run",
      emitSessionEvent,
    );

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("REQUESTS · 1/2 disposed");
    expect(result.text).toContain('R1 done "Split into prep and run"');
    expect(result.text).toContain('R2 open  object:other  human — "Recolor the other box"');
    expect(result.text).not.toContain("DELTA");
    expect(result.text).not.toContain("BOARD DIFF");
    expect(session.requests[0]).toMatchObject({ status: "done", note: "Split into prep and run" });
  });

  test("writes the disposition into the thread on the draft and announces it", () => {
    const session = sessionWithQueue();

    toolResolveRequest(session, "R1", "done", "Split into prep and run", emitSessionEvent);

    const thread = session.draft.annotations?.find((annotation) => annotation.id === "doc-1");
    expect(thread?.status).toBe("applied");
    expect(thread?.replies).toMatchObject([
      { author: "agent", body: "Split into prep and run" },
    ]);
    expect(session.requests[0]!.replies).toMatchObject([
      { author: "agent", body: "Split into prep and run" },
    ]);
    expect(session.events.map((event) => event.type)).toEqual(["annotations"]);
  });

  test("closes a declined thread as resolved", () => {
    const session = sessionWithQueue();

    toolResolveRequest(session, "R1", "declined", "Out of scope", emitSessionEvent);

    expect(session.draft.annotations?.[0]?.status).toBe("resolved");
  });

  test("leaves the draft alone for an invoke-only request", () => {
    const session = sessionWithQueue();

    toolResolveRequest(session, "R2", "done", "recolored it", emitSessionEvent);

    expect(session.draft.annotations?.map((annotation) => annotation.id)).toEqual(["doc-1"]);
    expect(session.events).toEqual([]);
    expect(session.requests[1]).toMatchObject({ status: "done", note: "recolored it" });
  });

  test("declines with a note", () => {
    const session = sessionWithQueue();

    const result = toolResolveRequest(
      session,
      "R2",
      "declined",
      "Out of scope for this pass",
      emitSessionEvent,
    );

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain('R2 declined "Out of scope for this pass"');
    expect(session.requests[1]!.status).toBe("declined");
  });

  test("rejects an unknown id, naming the current queue state", () => {
    const session = sessionWithQueue();

    const result = toolResolveRequest(session, "R9", "done", "note", emitSessionEvent);

    expect(result.isError).toBe(true);
    expect(result.text).toContain('no request "R9"');
    expect(result.text).toContain("REQUESTS · 0/2 disposed");
    expect(result.text).toContain("R1 open");
  });

  test("rejects an already-disposed id, naming the current queue state", () => {
    const session = sessionWithQueue();
    expect(toolResolveRequest(session, "R1", "done", "first pass", emitSessionEvent).isError)
      .toBeUndefined();

    const result = toolResolveRequest(
      session,
      "R1",
      "declined",
      "second thoughts",
      emitSessionEvent,
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain("R1 is already done");
    expect(result.text).toContain("REQUESTS · 1/2 disposed");
    expect(session.requests[0]!.note).toBe("first pass");
  });

  test("requires a non-empty note and a valid status", () => {
    const session = sessionWithQueue();

    expect(toolResolveRequest(session, "R1", "done", "  ", emitSessionEvent).isError).toBe(true);
    expect(toolResolveRequest(session, "R1", "done", "  ", emitSessionEvent).text)
      .toContain("note must be a non-empty string");
    expect(toolResolveRequest(
      session,
      "R1",
      "later" as unknown as "done",
      "note",
      emitSessionEvent,
    ).isError).toBe(true);
    expect(toolResolveRequest(session, "  ", "done", "note", emitSessionEvent).isError).toBe(true);
    expect(session.requests[0]!.status).toBe("open");
  });
});

describe("the queue in operation results", () => {
  // The queue is re-rendered into section ③ on every request, so an operation
  // result restating it would put the same list in the window twice. It stays
  // on the tools whose whole answer IS the queue: resolve_request and
  // add_annotation (covered above and below).
  test("an applied operation reports its own change, not the standing queue", () => {
    const session = sessionWithQueue();
    toolResolveRequest(session, "R1", "done", "split it", emitSessionEvent);

    const result = runOp(session, "update_text", { id: "task", text: "renamed" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · update_text task");
    expect(result.text).not.toContain("REQUESTS ·");
    expect(result.text).not.toContain('R1 done "split it"');
  });

  test("resolve_request still answers with the queue — that is its whole result", () => {
    const session = sessionWithQueue();

    const result = toolResolveRequest(session, "R1", "done", "split it", emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("REQUESTS · 1/2 disposed");
    expect(result.text).toContain('R1 done "split it"');
    expect(result.text).toContain("R2 open");
  });
});

describe("add_annotation", () => {
  test("opens an agent-authored thread on the object and queues it", () => {
    const session = makeTestSession(makeDocument([box("task", 0, 0)]), ["task"]);
    syncSessionRequests(session);

    const result = toolAddAnnotation(
      session,
      "task",
      "Is this the retry path, or the happy path?",
      emitSessionEvent,
    );

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · add_annotation annotation-1");
    expect(result.text).toContain(
      'DELTA · thread annotation-1 opened on object:task  agent'
      + ' — "Is this the retry path, or the happy path?"',
    );
    expect(result.text).toContain("REQUESTS · 0/1 disposed");
    expect(result.details).toEqual({
      operation: "add_annotation",
      annotationId: "annotation-1",
    });
    expect(session.draft.annotations).toMatchObject([
      {
        id: "annotation-1",
        target: { kind: "object", objectId: "task" },
        intent: "agent-request",
        status: "open",
        createdBy: "agent",
        replies: [],
      },
    ]);
    expect(session.requests).toMatchObject([
      { alias: "R1", annotationId: "annotation-1", createdBy: "agent", status: "open" },
    ]);
    expect(session.events.map((event) => event.type)).toEqual(["annotations"]);
  });

  test("rejects an unknown object and an empty body without touching the draft", () => {
    const session = makeTestSession(makeDocument([box("task", 0, 0)]), ["task"]);

    const unknown = toolAddAnnotation(session, "missing", "Why?", emitSessionEvent);
    const blank = toolAddAnnotation(session, "task", "  ", emitSessionEvent);

    expect(unknown.isError).toBe(true);
    expect(unknown.text).toContain('no object "missing"');
    expect(blank.isError).toBe(true);
    expect(blank.text).toContain("body must be a non-empty question");
    expect(session.draft.annotations ?? []).toEqual([]);
    expect(session.events).toEqual([]);
  });
});

describe("finalize request gate", () => {
  test("blocks a commit while a user-authored thread is open", () => {
    const session = sessionWithQueue();
    session.draft = makeDocument([
      { ...box("task", 0, 0), text: "renamed" },
      box("other", 320, 0),
    ]);

    const result = toolFinalize(session, "committed", "Renamed the task", emitSessionEvent);

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Finalize blocked");
    expect(result.text).toContain("R1 open");
  });

  test("lets a commit through with only an agent-authored thread open", () => {
    const session = makeTestSession(makeDocument([box("task", 0, 0)]), ["task"]);
    syncSessionRequests(session);
    toolAddAnnotation(session, "task", "Is this the retry path?", emitSessionEvent);
    session.draft = {
      ...session.draft,
      objects: [{ ...box("task", 0, 0), text: "renamed" }],
    };

    const result = toolFinalize(session, "committed", "Renamed the task", emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(session.status).toBe("proposal-ready");
    expect(session.proposal?.operations.map((operation) => operation.type)).toEqual([
      "updateObject",
      "addAnnotation",
    ]);
  });
});
