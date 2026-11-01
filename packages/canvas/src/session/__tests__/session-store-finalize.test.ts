import { describe, expect, test } from "bun:test";

import { createInteractiveCanvasState } from "@codecaine-ai/canvas/actions";
import type { CanvasAgentPatchOperation } from "@codecaine-ai/canvas/actions";

import { handleApplyAgentPatch } from "../../canvas/src/state/actions/agent-patch";
import {
  draftWithPageFrame,
  emitSessionEvent,
  syncSessionRequests,
  toolFinalize,
  type LayoutSession,
} from "../src/service/session";
import type { LayoutToolTextResult } from "../src/service/session/tools";
import type { AgentSessionAnnotation } from "../src/protocol";
import { FIGJAM_CANVAS_STYLE, makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

function requestAnnotation(id: string, objectId: string, body: string): AgentSessionAnnotation {
  return {
    id,
    intent: "agent-request",
    body,
    target: { kind: "object", objectId },
  };
}

function expectBlocked(result: LayoutToolTextResult, session: LayoutSession, detail: string): void {
  expect(result.isError).toBe(true);
  expect(result.text).toContain("Finalize blocked");
  expect(result.text).toContain(detail);
  expect(session.status).toBe("running");
  expect(session.proposal).toBeNull();
  expect(session.events).toHaveLength(0);
}

describe("finalize committed — lint gate (all scoped diagnostics)", () => {
  test("blocks a parentId child that escapes its section", () => {
    const section = { ...box("section", 0, 0, 480, 320, "section"), text: "Section" };
    const child = { ...box("child", 80, 96, 184, 96, "process"), parentId: "section" };
    const baseline = makeDocument([section, child]);
    const session = makeTestSession(baseline, ["section"]);
    session.draft = makeDocument([
      section,
      { ...child, geometry: { ...child.geometry, x: 400 } },
    ]);

    const result = toolFinalize(session, "committed", "Escaped child should fail", emitSessionEvent);

    expectBlocked(result, session, "E1 containment: child extends 104px outside its section section");
  });

  test("blocks overflow beyond the base section", () => {
    const frame = {
      ...box("page", 0, 0, 640, 480, "section"),
    };
    const card = box("card", 96, 96, 184, 96, "process");
    const baseline = makeDocument([frame, card]);
    const session = makeTestSession(baseline, ["card"]);
    session.draft = makeDocument([
      frame,
      { ...card, geometry: { ...card.geometry, x: 600 } },
    ]);

    const result = toolFinalize(session, "committed", "Overflow should fail", emitSessionEvent);

    expectBlocked(result, session, "card extends 144px past the base section page");
  });

  test.each(["five", "five 🚀"])("forced sticky rows block finalize whatever the last row holds (%s)", (last) => {
    // 128px holds two 36px rows: five forced lines clip whatever the rocket's fallback width.
    const note = { ...box("note", 0, 0, 176, 128, "sticky"), style: { shape: "note" as const }, text: "one" };
    const session = makeTestSession(makeDocument([note]), ["note"], { canvasStyle: FIGJAM_CANVAS_STYLE });
    session.draft = makeDocument([{ ...note, text: `one\ntwo\nthree\nfour\n${last}` }]);

    const result = toolFinalize(session, "committed", "Added five rows", emitSessionEvent);

    expectBlocked(result, session, "clipped-text");
  });

  test("warning-tier findings block until fixed, then the same session commits", () => {
    const labeled = [{ ...connect("edge", "a", "b"), label: "go" }];
    const baseline = makeDocument([
      box("a", 0, 0, 192, 96, "process"),
      box("b", 416, 0, 192, 96, "process"),  // gap 224 — clean baseline
    ], labeled);
    // Figjam chip geometry: the "go" chip is 44×30px ("go" in Inter Bold 16 + 12px a side).
    const session = makeTestSession(baseline, ["a", "b"], { canvasStyle: FIGJAM_CANVAS_STYLE });
    session.draft = makeDocument([
      box("a", 0, 0, 192, 96, "process"),
      box("b", 240, 0, 192, 96, "process"),  // gap 48 — under the "go" chip's 76px need
    ], labeled);

    const blocked = toolFinalize(session, "committed", "Tightened the flow", emitSessionEvent);

    expectBlocked(
      blocked,
      session,
      'W1 unreadable-labels: label "go" chip on edge (44×30px) bleeds onto a and b',
    );

    session.draft = makeDocument([
      box("a", 0, 0, 192, 96, "process"),
      box("b", 400, 0, 192, 96, "process"),
    ], labeled);

    const committed = toolFinalize(
      session,
      "committed",
      "Tightened the flow with a readable label",
      emitSessionEvent,
    );

    expect(committed.isError).toBeUndefined();
    expect(committed.text).toContain("Committed:");
    expect(session.status).toBe("proposal-ready");
    expect(session.proposal).not.toBeNull();
    expect(session.proposal!.summary).toBe("Tightened the flow with a readable label");
    expect(session.proposal!.lint).toBe("DIAGNOSTICS · clean");
  });

  test("notes never block: a label the bundled fonts cannot measure commits, and the note rides along", () => {
    const baseline = makeDocument([box("a", 0, 0, 192, 96, "process")]);
    const session = makeTestSession(baseline, ["a"], { canvasStyle: FIGJAM_CANVAS_STYLE });
    // An emoji name: Chromium paints 🚀 in a fallback font, so its fit is an estimate (a note).
    session.draft = makeDocument([{ ...box("a", 0, 0, 192, 96, "process"), text: "Ship it 🚀" }]);

    const committed = toolFinalize(session, "committed", "Named the launch step", emitSessionEvent);

    expect(committed.isError).toBeUndefined();
    expect(session.status).toBe("proposal-ready");
    expect(session.proposal!.lint).toContain("DIAGNOSTICS · 0 errors · 0 warnings · 1 note");
    expect(session.proposal!.lint).toContain('N1 clipped-text: a: label fits at 192×96');
    expect(session.proposal!.lint).toContain('the bundled fonts lack "🚀"');
  });

  test("a person's own prose names never block; prose the agent writes into a name does until fixed", () => {
    const prose = "Compare Generated Intents to Labeled Intents";
    const theirs = { ...box("theirs", 0, 0, 400, 200, "process"), text: prose };
    // Tall enough that the prose name wraps without clipping: only the prose rule speaks.
    const task = box("task", 600, 0, 184, 120, "process");
    // Frameless with a long board title: the session's first draft carries an
    // injected page frame titled with it, which is scaffolding, not the agent's.
    const baseline = { ...makeDocument([theirs, task]), title: "Intent Classifier Example: Support Ticket Classification" };
    const session = makeTestSession(baseline, ["theirs", "task"], { draft: draftWithPageFrame(baseline) });

    // The agent rewrites its neighbour's name into prose: that one is the agent's.
    session.draft = {
      ...session.draft,
      objects: session.draft.objects.map((object) =>
        object.id === "task" ? { ...object, text: `${prose} twice over` } : object),
    };
    expectBlocked(
      toolFinalize(session, "committed", "Renamed the task", emitSessionEvent),
      session,
      "W1 label-is-prose: task's name has",
    );

    // A short name with its fact in the detail commits — with the person's own
    // long name and the board-titled page frame both still in scope.
    session.draft = {
      ...session.draft,
      objects: session.draft.objects.map((object) =>
        object.id === "task" ? { ...object, text: "Compare intents", detail: "labeled set" } : object),
    };
    const committed = toolFinalize(session, "committed", "Renamed the task", emitSessionEvent);
    expect(committed.isError).toBeUndefined();
    expect(session.proposal!.lint).toBe("DIAGNOSTICS · clean");
  });

  test("error-tier findings outside the scope do not block", () => {
    // A pre-existing escaped child the session was never asked to touch.
    const page = box("page", 0, 0, 1600, 1200, "section");
    const section = { ...box("section", 600, 600, 480, 320, "section"), parentId: "page" };
    const escaped = { ...box("escaped", 1000, 700, 184, 96, "process"), parentId: "section" };
    const task = box("task", 0, 0, 184, 96, "process");
    const baseline = makeDocument([page, section, escaped, task]);
    const session = makeTestSession(baseline, ["task"]);
    session.draft = makeDocument([
      page,
      section,
      escaped,
      { ...task, text: "renamed task" },
    ]);

    const result = toolFinalize(session, "committed", "Renamed the task", emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(session.status).toBe("proposal-ready");
    expect(session.proposal!.operations).toHaveLength(1);
  });

  test("an operation returns lint findings without blocking the edit", () => {
    const baseline = makeDocument([
      box("a", 0, 0, 160, 96, "process"),
      box("b", 320, 0, 160, 96, "process"),
    ], [{ ...connect("edge", "a", "b"), label: "go" }]);
    const session = makeTestSession(baseline, ["a", "b"], { canvasStyle: FIGJAM_CANVAS_STYLE });

    const result = runOp(session, "move_to", { id: "b", x: 200, y: 0 });

    expect(result.isError).not.toBe(true);
    expect(result.text).toContain("APPLIED · move_to b");
    expect(result.text).toContain("DELTA");
    // Actual label fit still fires even though the boxes have visible separation.
    expect(result.text).toContain("LINTS · +1 −0");
    expect(result.text).toContain('label "go" chip on edge (44×30px) bleeds onto a and b');
    expect(result.text).not.toContain("crowding:");
    expect(session.draft.objects.find((object) => object.id === "b")?.geometry.x).toBe(200);
    expect(session.status).toBe("running");
    expect(session.proposal).toBeNull();
  });
});

describe("finalize committed — request gate", () => {
  test("blocks while any user request is open, naming the open entries", () => {
    const baseline = makeDocument([box("task", 0, 0, 184, 96, "process")]);
    const session = makeTestSession(baseline, ["task"], {
      annotations: [requestAnnotation("req-1", "task", "Split this into two steps")],
    });
    syncSessionRequests(session);
    session.draft = makeDocument([{ ...box("task", 0, 0, 184, 96, "process"), text: "edited" }]);

    const result = toolFinalize(session, "committed", "Edited the task", emitSessionEvent);

    expectBlocked(result, session, 'R1 open  object:task  human — "Split this into two steps"');
    expect(result.text).toContain("dispose with resolve_request");
  });

  test("commits once every request reaches a terminal state", () => {
    const baseline = makeDocument([box("task", 0, 0, 184, 96, "process")]);
    const session = makeTestSession(baseline, ["task"], {
      annotations: [
        requestAnnotation("req-1", "task", "Split this into two steps"),
        requestAnnotation("req-2", "task", "Make it pop"),
      ],
    });
    syncSessionRequests(session);
    session.draft = makeDocument([{ ...box("task", 0, 0, 184, 96, "process"), text: "edited" }]);
    session.requests[0]!.status = "done";
    session.requests[0]!.note = "split into two steps";
    session.requests[1]!.status = "declined";
    session.requests[1]!.note = "out of scope";

    const result = toolFinalize(session, "committed", "Edited the task", emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(session.status).toBe("proposal-ready");
    expect(session.events.map((event) => event.type)).toEqual(["proposal-ready"]);
  });

  test("does not block on an open agent-authored thread", () => {
    const task = box("task", 0, 0, 184, 96, "process");
    const session = makeTestSession(makeDocument([task]), ["task"], {
      annotations: [{
        ...requestAnnotation("agent-question", "task", "Should this be split further?"),
        createdBy: "agent",
      }],
    });
    syncSessionRequests(session);
    session.draft = {
      ...session.draft,
      objects: [{ ...task, text: "edited" }],
    };

    const result = toolFinalize(session, "committed", "Edited the task", emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(session.status).toBe("proposal-ready");
    expect(session.events.map((event) => event.type)).toEqual(["proposal-ready"]);
  });

  test("reports lint blockers and open requests together", () => {
    const section = { ...box("section", 0, 0, 480, 320, "section"), text: "Section" };
    const child = { ...box("child", 80, 96, 184, 96, "process"), parentId: "section" };
    const baseline = makeDocument([section, child]);
    const session = makeTestSession(baseline, ["section"], {
      annotations: [requestAnnotation("req-1", "section", "Tighten the layout")],
    });
    syncSessionRequests(session);
    session.draft = makeDocument([
      section,
      { ...child, geometry: { ...child.geometry, x: 400 } },
    ]);

    const result = toolFinalize(session, "committed", "Should fail twice over", emitSessionEvent);

    expect(result.isError).toBe(true);
    expect(result.text).toContain("E1 containment:");
    expect(result.text).toContain("R1 open");
  });
});

describe("finalize committed — waypoint steering", () => {
  test("a waypoint-only steer commits a proposal whose op carries the waypoints", () => {
    const baseline = makeDocument(
      [box("a", 0, 0, 200, 80, "process"), box("b", 400, 200, 200, 80, "process")],
      [connect("edge", "a", "b")],
    );
    const session = makeTestSession(baseline, ["a", "b"]);

    const applied = runOp(session, "reroute", {
      id: "edge",
      points: [[300, 40], [300, 240]],
    });

    expect(applied.isError).not.toBe(true);
    expect(applied.text).toContain("APPLIED · reroute edge");
    // The steer is a real diff: DELTA names the steered connection.
    expect(applied.text).toContain("edge  wp none → 300,40");

    const result = toolFinalize(session, "committed", "Steered the edge", emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(session.status).toBe("proposal-ready");
    expect(session.proposal!.operations).toEqual([
      {
        type: "updateConnection",
        connectionId: "edge",
        patch: { waypoints: [[300, 40], [300, 240]] },
      },
    ]);

    // Round trip: replaying the proposal ops through the live agent-patch
    // reducer reproduces the draft's steering on the accepted board.
    const accepted = handleApplyAgentPatch(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations: session.proposal!.operations as CanvasAgentPatchOperation[],
    });
    expect(accepted.document.connections).toEqual([
      { ...connect("edge", "a", "b"), waypoints: [[300, 40], [300, 240]] },
    ]);
    expect(accepted.document.connections[0]!.waypoints)
      .toEqual(session.draft.connections[0]!.waypoints!);
  });
});

describe("finalize argument validation", () => {
  test("rejects an empty message for both outcomes", () => {
    const baseline = makeDocument([box("task", 0, 0, 184, 96, "process")]);
    const session = makeTestSession(baseline, ["task"]);

    const committed = toolFinalize(session, "committed", "   ", emitSessionEvent);
    expect(committed.isError).toBe(true);
    expect(committed.text).toContain("message must be a non-empty");

    const none = toolFinalize(session, "none", "", emitSessionEvent);
    expect(none.isError).toBe(true);
    expect(none.text).toContain("message must be a non-empty");

    expect(session.status).toBe("running");
    expect(session.events).toEqual([]);
  });

  test("rejects an unknown outcome", () => {
    const baseline = makeDocument([box("task", 0, 0, 184, 96, "process")]);
    const session = makeTestSession(baseline, ["task"]);

    const result = toolFinalize(
      session,
      "shipped" as unknown as "committed",
      "message",
      emitSessionEvent,
    );

    expect(result.isError).toBe(true);
    expect(result.text).toContain('outcome must be "committed" or "none"');
  });

  test("committed with an unchanged draft has nothing to commit", () => {
    const baseline = makeDocument([box("task", 0, 0, 184, 96, "process")]);
    const session = makeTestSession(baseline, ["task"]);

    const result = toolFinalize(session, "committed", "No-op", emitSessionEvent);

    expect(result.isError).toBe(true);
    expect(result.text).toContain("Nothing to commit");
    expect(session.status).toBe("running");
  });
});

describe("finalize none", () => {
  test("ends the run without a proposal and carries the message as the abandon reason", () => {
    const baseline = makeDocument([box("task", 0, 0, 184, 96, "process")]);
    const session = makeTestSession(baseline, ["task"]);

    const result = toolFinalize(
      session,
      "none",
      "The request needs objects outside my scope.",
      emitSessionEvent,
    );

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("without a proposal");
    expect(session.status).toBe("abandoned");
    expect(session.proposal).toBeNull();
    expect(session.events).toEqual([{
      type: "abandoned",
      sessionId: session.id,
      reason: "The request needs objects outside my scope.",
    }]);
  });

  test("outcome none is valid even with open requests and error lints", () => {
    const section = { ...box("section", 0, 0, 480, 320, "section"), text: "Section" };
    const child = { ...box("child", 80, 96, 184, 96, "process"), parentId: "section" };
    const baseline = makeDocument([section, child]);
    const session = makeTestSession(baseline, ["section"], {
      annotations: [requestAnnotation("req-1", "section", "Tighten the layout")],
    });
    syncSessionRequests(session);
    session.draft = makeDocument([
      section,
      { ...child, geometry: { ...child.geometry, x: 400 } },
    ]);

    const result = toolFinalize(session, "none", "Cannot do this safely.", emitSessionEvent);

    expect(result.isError).toBeUndefined();
    expect(session.status).toBe("abandoned");
  });
});
