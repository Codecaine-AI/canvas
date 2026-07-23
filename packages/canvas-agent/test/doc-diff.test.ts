import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasConnection } from "@codecaine-ai/canvas/schema";

import { diffDocuments } from "../src/board/doc-diff";
import { box, connect, makeDocument } from "./synthetic";

describe("diffDocuments", () => {
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

  test("uses updateConnection and never emits draft waypoints", () => {
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
        patch: { label: "After", style: "dashed", color: "blue" },
      },
      {
        type: "addConnection",
        connection: {
          id: "added",
          from: { objectId: "b" },
          to: { objectId: "a" },
          label: "New",
        },
      },
    ]);
    expect(JSON.stringify(operations)).not.toContain("waypoints");
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

  test("ignores annotation array differences because annotations are read-only to the agent", () => {
    const baseline = makeDocument([box("kept", 0, 0)]);
    baseline.annotations = [{
      id: "comment",
      target: { kind: "object", objectId: "kept" },
      intent: "agent-request",
      body: "Before",
      status: "open",
      createdBy: "human",
    }];
    const draft = structuredClone(baseline);
    draft.annotations![0] = { ...draft.annotations![0]!, body: "After" };

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
      [{ ...connect("connection", "a", "b"), waypoints: [[80, 112]] }],
    );
    const draft = makeDocument(
      [{ ...box("a", 0, 0), parentId: "new-section" }, box("b", 192, 0)],
      [{ ...connect("connection", "a", "b"), waypoints: [[320, 240]] }],
    );

    expect(diffDocuments(baseline, draft)).toEqual([]);
  });
});
