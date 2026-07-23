/// <reference types="bun" />

import { describe, expect, it } from "bun:test";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "@codecaine-ai/canvas";
import type { AgentPatchOperation } from "@codecaine-ai/canvas-agent/protocol";
import { classifyChanges } from "../classify-changes";

function makeObject(
  overrides: Partial<InteractiveCanvasObject> & Pick<InteractiveCanvasObject, "id">,
): InteractiveCanvasObject {
  const { id, ...rest } = overrides;
  return {
    id,
    type: "process",
    text: id,
    parentId: null,
    geometry: { x: 0, y: 0, width: 100, height: 80 },
    ...rest,
  };
}

function makeDocument(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "classify-test",
    mode: "diagram",
    objects,
    connections: [],
  };
}

describe("classifyChanges", () => {
  it("classifies movement, resizing, creation, and removals against the baseline", () => {
    const baseline = makeDocument([
      makeObject({ id: "moved", geometry: { x: 10, y: 20, width: 100, height: 80 } }),
      makeObject({ id: "resized", geometry: { x: 200, y: 20, width: 120, height: 90 } }),
      makeObject({ id: "removed", geometry: { x: 400, y: 40, width: 80, height: 60 } }),
    ]);
    const operations: AgentPatchOperation[] = [
      {
        type: "updateObject",
        objectId: "moved",
        patch: { geometry: { x: 30, y: 50, width: 100, height: 80 } },
      },
      {
        type: "updateObject",
        objectId: "resized",
        patch: { geometry: { x: 200, y: 20, width: 180, height: 100 } },
      },
      {
        type: "addObject",
        object: {
          id: "created",
          type: "sticky",
          text: "New",
          geometry: { x: 600, y: 70, width: 160, height: 120 },
        },
      },
      { type: "removeObject", objectId: "removed" },
      { type: "removeConnection", connectionId: "connection-1" },
    ];

    expect(classifyChanges(baseline, operations)).toEqual({
      moved: [
        {
          id: "moved",
          from: { x: 10, y: 20, width: 100, height: 80 },
          to: { x: 30, y: 50, width: 100, height: 80 },
          resized: false,
        },
        {
          id: "resized",
          from: { x: 200, y: 20, width: 120, height: 90 },
          to: { x: 200, y: 20, width: 180, height: 100 },
          resized: true,
        },
      ],
      created: [
        { id: "created", rect: { x: 600, y: 70, width: 160, height: 120 } },
      ],
      removed: [
        { id: "removed", rect: { x: 400, y: 40, width: 80, height: 60 } },
      ],
      removedConnections: ["connection-1"],
      displaced: [],
    });
  });

  it("ignores non-geometry updates and unchanged or unknown object geometry", () => {
    const baseline = makeDocument([
      makeObject({ id: "same", geometry: { x: 10, y: 20, width: 100, height: 80 } }),
    ]);
    const operations: AgentPatchOperation[] = [
      { type: "updateObject", objectId: "same", patch: { text: "Renamed" } },
      {
        type: "updateObject",
        objectId: "same",
        patch: { geometry: { x: 10, y: 20, width: 100, height: 80 } },
      },
      {
        type: "updateObject",
        objectId: "unknown",
        patch: { geometry: { x: 1, y: 2, width: 3, height: 4 } },
      },
      { type: "removeObject", objectId: "unknown" },
    ];

    expect(classifyChanges(baseline, operations)).toEqual({
      moved: [],
      created: [],
      removed: [],
      removedConnections: [],
      displaced: [],
    });
  });
});
