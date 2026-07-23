import { describe, expect, test } from "bun:test";

import { createInteractiveCanvasState } from "@codecaine-ai/canvas/actions";

import { handleApplyAgentPatch } from "../../canvas/src/state/actions/agent-patch";
import { box, connect, makeDocument } from "./synthetic";

describe("handleApplyAgentPatch updateConnection", () => {
  test("merges editable fields, applies waypoint steering, and skips an unknown id", () => {
    const document = makeDocument(
      [box("a", 0, 0), box("b", 192, 0)],
      [
        {
          ...connect("connection", "a", "b"),
          label: "Before",
          style: "solid",
          color: "gray",
          waypoints: [[80, 112]],
        },
      ],
    );
    const state = createInteractiveCanvasState(document);

    const next = handleApplyAgentPatch(state, {
      type: "canvas.applyAgentPatch",
      operations: [
        {
          type: "updateConnection",
          connectionId: "unknown",
          patch: { label: "Must not land", color: "red" },
        },
        {
          type: "updateConnection",
          connectionId: "connection",
          patch: {
            label: "After",
            style: "dashed",
            color: "blue",
            waypoints: [[320, 240]],
          },
        },
      ],
    });

    expect(next.document.connections).toEqual([
      {
        id: "connection",
        from: { objectId: "a" },
        to: { objectId: "b" },
        label: "After",
        style: "dashed",
        color: "blue",
        // Waypoints are part of the agent's steering surface and apply
        // verbatim (post-reduce reconcile still clears them if an endpoint
        // object later moves asymmetrically).
        waypoints: [[320, 240]],
      },
    ]);
    expect(next.lastChange?.changedConnectionIds).toEqual(["connection"]);
    expect(next.history.past).toHaveLength(1);
  });
});
