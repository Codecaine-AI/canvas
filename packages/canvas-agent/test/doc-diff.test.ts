import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasConnection } from "@codecaine-ai/canvas/schema";

import { diffDocuments } from "../src/board/doc-diff";
import { box, connect, makeDocument } from "./synthetic";

describe("diffDocuments", () => {
  test("emits a changed description before entity operations", () => {
    const baseline = {
      ...makeDocument([box("updated", 0, 0)]),
      description: "Before",
    };
    const draft = {
      ...makeDocument([{ ...box("updated", 0, 0), text: "After" }]),
      description: "After",
    };

    expect(diffDocuments(baseline, draft)).toEqual([
      { type: "updateDescription", description: "After" },
      { type: "updateObject", objectId: "updated", patch: { text: "After" } },
    ]);
  });

  test("emits no description operation when descriptions match", () => {
    const baseline = {
      ...makeDocument([box("kept", 0, 0)]),
      description: "Same account",
    };
    const draft = structuredClone(baseline);

    expect(diffDocuments(baseline, draft)).toEqual([]);
  });

  test("emits minimal object add, update, and remove operations without parentId", () => {
    const baseline = makeDocument([
      box("removed", 0, 0),
      { ...box("updated", 192, 0), text: "Before", color: "gray", parentId: "old-section" },
      box("kept", 384, 0),
    ]);
    const draft = makeDocument([
      box("kept", 384, 0),
      { ...box("added", 576, 0), parentId: "new-section", color: "green" },
      { ...box("updated", 192, 0), text: "After", color: "gray", parentId: "new-section" },
    ]);

    const operations = diffDocuments(baseline, draft);

    expect(operations).toEqual([
      {
        type: "addObject",
        object: {
          id: "added",
          type: "rectangle",
          text: "added",
          color: "green",
          geometry: { x: 576, y: 0, width: 160, height: 96 },
        },
      },
      { type: "updateObject", objectId: "updated", patch: { text: "After" } },
      { type: "removeObject", objectId: "removed" },
    ]);
    expect(JSON.stringify(operations)).not.toContain("parentId");
  });

  test("carries waypoint steering on updateConnection and addConnection as deep copies", () => {
    const baselineConnection: InteractiveCanvasConnection = {
      ...connect("existing", "a", "b"),
      label: "Before",
      style: "solid",
      color: "gray",
      waypoints: [[80, 112]],
    };
    const draftConnection: InteractiveCanvasConnection = {
      ...connect("existing", "a", "b"),
      label: "After",
      style: "dashed",
      color: "blue",
      waypoints: [[320, 240]],
    };
    const addedConnection: InteractiveCanvasConnection = {
      ...connect("added", "b", "a"),
      label: "New",
      waypoints: [[256, 128]],
    };
    const baseline = makeDocument([box("a", 0, 0), box("b", 192, 0)], [baselineConnection]);
    const draft = makeDocument(
      [box("a", 0, 0), box("b", 192, 0)],
      [draftConnection, addedConnection],
    );

    const operations = diffDocuments(baseline, draft);

    expect(operations).toEqual([
      {
        type: "updateConnection",
        connectionId: "existing",
        patch: { label: "After", style: "dashed", color: "blue", waypoints: [[320, 240]] },
      },
      {
        type: "addConnection",
        connection: {
          id: "added",
          from: { objectId: "b" },
          to: { objectId: "a" },
          label: "New",
          waypoints: [[256, 128]],
        },
      },
    ]);
    // Deep copies: emitted waypoints never alias the draft's arrays.
    const [update, add] = operations as [
      Extract<(typeof operations)[number], { type: "updateConnection" }>,
      Extract<(typeof operations)[number], { type: "addConnection" }>,
    ];
    expect(update.patch.waypoints).not.toBe(draftConnection.waypoints);
    expect(update.patch.waypoints![0]).not.toBe(draftConnection.waypoints![0]);
    expect(add.connection.waypoints).not.toBe(addedConnection.waypoints);
    expect(add.connection.waypoints![0]).not.toBe(addedConnection.waypoints![0]);
  });

  test("a waypoint-only change emits exactly one updateConnection op carrying the waypoints", () => {
    const baseline = makeDocument(
      [box("a", 0, 0), box("b", 192, 0)],
      [{ ...connect("steered", "a", "b"), waypoints: [[80, 112]] }],
    );
    const draft = makeDocument(
      [box("a", 0, 0), box("b", 192, 0)],
      [{ ...connect("steered", "a", "b"), waypoints: [[320, 240], [400, 240]] }],
    );

    expect(diffDocuments(baseline, draft)).toEqual([
      {
        type: "updateConnection",
        connectionId: "steered",
        patch: { waypoints: [[320, 240], [400, 240]] },
      },
    ]);
  });

  test("clearing waypoints emits an explicit undefined the apply spread clears with", () => {
    const baseline = makeDocument(
      [box("a", 0, 0), box("b", 192, 0)],
      [{ ...connect("steered", "a", "b"), waypoints: [[80, 112]] }],
    );
    const draft = makeDocument(
      [box("a", 0, 0), box("b", 192, 0)],
      [connect("steered", "a", "b")],
    );

    const operations = diffDocuments(baseline, draft);

    expect(operations).toHaveLength(1);
    const operation = operations[0] as Extract<
      (typeof operations)[number],
      { type: "updateConnection" }
    >;
    expect(operation.type).toBe("updateConnection");
    expect(operation.connectionId).toBe("steered");
    // toEqual ignores undefined-valued keys, so assert the own property
    // directly: it must exist so the reducer's patch spread overwrites the
    // stored waypoints with undefined.
    expect(Object.keys(operation.patch)).toEqual(["waypoints"]);
    expect(operation.patch.waypoints).toBeUndefined();
  });

  test("structurally equal waypoints produce no op even across distinct arrays", () => {
    const baseline = makeDocument(
      [box("a", 0, 0), box("b", 192, 0)],
      [{ ...connect("steered", "a", "b"), waypoints: [[80, 112], [160, 112]] }],
    );
    const draft = makeDocument(
      [box("a", 0, 0), box("b", 192, 0)],
      [{ ...connect("steered", "a", "b"), waypoints: [[80, 112], [160, 112]] }],
    );

    expect(diffDocuments(baseline, draft)).toEqual([]);
  });

  test("orders operation categories deterministically", () => {
    const baseline = makeDocument(
      [box("removed", 0, 0), box("updated", 192, 0), box("kept", 384, 0)],
      [
        { ...connect("changed-connection", "updated", "kept"), label: "Before" },
        connect("removed-connection", "kept", "removed"),
      ],
    );
    const draft = makeDocument(
      [box("kept", 384, 0), box("added", 576, 0), { ...box("updated", 192, 0), text: "After" }],
      [
        { ...connect("changed-connection", "updated", "kept"), label: "After" },
        connect("added-connection", "added", "kept"),
      ],
    );
    expect(diffDocuments(baseline, draft).map((operation) => operation.type)).toEqual([
      "addObject",
      "updateObject",
      "updateConnection",
      "removeConnection",
      "removeObject",
      "addConnection",
    ]);
  });

  test("emits annotation-thread operations last, after every entity operation", () => {
    const baseline = makeDocument([box("kept", 0, 0)]);
    const draft = makeDocument([box("kept", 0, 0), box("added", 320, 0)]);
    draft.annotations = [{
      id: "annotation-1",
      target: { kind: "object", objectId: "added" },
      intent: "agent-request",
      body: "Is this the retry path?",
      status: "open",
      createdBy: "agent",
      replies: [],
    }];

    expect(diffDocuments(baseline, draft).map((operation) => operation.type)).toEqual([
      "addObject",
      "addAnnotation",
    ]);
  });

  test("emits new replies oldest first and a status move for an existing thread", () => {
    const baseline = makeDocument([box("kept", 0, 0)]);
    baseline.annotations = [{
      id: "annotation-1",
      target: { kind: "object", objectId: "kept" },
      intent: "agent-request",
      body: "Split this into two steps",
      status: "open",
      createdBy: "human",
      replies: [{ id: "reply-1", author: "human", body: "prep and run" }],
    }];
    const draft = structuredClone(baseline);
    draft.annotations![0] = {
      ...draft.annotations![0]!,
      status: "applied",
      replies: [
        ...draft.annotations![0]!.replies,
        { id: "reply-2", author: "agent", body: "Split into prep and run" },
      ],
    };

    expect(diffDocuments(baseline, draft)).toEqual([
      {
        type: "appendAnnotationReply",
        annotationId: "annotation-1",
        reply: { id: "reply-2", author: "agent", body: "Split into prep and run" },
      },
      { type: "setAnnotationStatus", annotationId: "annotation-1", status: "applied" },
    ]);
  });

  test("emits nothing for a thread the draft dropped — it rides its target's removal", () => {
    const baseline = makeDocument([box("kept", 0, 0)]);
    baseline.annotations = [{
      id: "annotation-1",
      target: { kind: "object", objectId: "kept" },
      intent: "agent-request",
      body: "Before",
      status: "open",
      createdBy: "human",
      replies: [],
    }];
    const draft = structuredClone(baseline);
    draft.annotations = [];

    expect(diffDocuments(baseline, draft)).toEqual([]);
  });

  test("returns an empty operation list for an unchanged document", () => {
    const baseline = makeDocument(
      [{ ...box("a", 0, 0), style: { strokeWidth: 4 } }, box("b", 192, 0)],
      [{ ...connect("connection", "a", "b"), waypoints: [[80, 112]] }],
    );
    const draft = structuredClone(baseline);

    expect(diffDocuments(baseline, draft)).toEqual([]);
  });

  test("emits an object type change (pill terminals must survive accept)", () => {
    const baseline = makeDocument([box("a", 0, 0)]);
    const draft = makeDocument([{ ...box("a", 0, 0), type: "pill" as const }]);

    expect(diffDocuments(baseline, draft)).toEqual([
      { type: "updateObject", objectId: "a", patch: { type: "pill" } },
    ]);
  });

  test("does not emit empty patches when only excluded fields change", () => {
    const baseline = makeDocument(
      [{ ...box("a", 0, 0), parentId: "old-section" }, box("b", 192, 0)],
      [connect("connection", "a", "b")],
    );
    const draft = makeDocument(
      [{ ...box("a", 0, 0), parentId: "new-section" }, box("b", 192, 0)],
      [connect("connection", "a", "b")],
    );

    expect(diffDocuments(baseline, draft)).toEqual([]);
  });
});
