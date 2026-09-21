/**
 * CONNECTIONS — the wires. Endpoint validation accepts any object id —
 * nodes, stickies, and sections alike (service/session/op-surface.ts); the
 * routed truth comes back in every apply result's ROUTES block; the field
 * enums are generated into ../vocabulary.generated.ts from the schema
 * tables.
 */
import type { KindSpec } from "./spec";

export const CONNECTIONS_SPEC: KindSpec = {
  description:
    "A connection is a routed wire between two objects; endpoints, label, style, arrow, color, and waypoints are fields on the connection, not separate objects.",
  functionality: [
    {
      topic: "endpoints",
      items: [
        {
          point:
            "endpoints attach to ANY object — nodes, stickies, and sections alike",
          subpoints: [
            "a container endpoint says the relationship belongs to the whole area rather than one node inside it",
          ],
        },
        "each endpoint is { objectId, anchor?, position? } — omit the steering fields and the router chooses the sides itself",
      ],
    },
    {
      topic: "routing",
      items: [
        "the path uses orthogonal routing from the endpoints; aligned facing endpoints with a clear corridor can produce a straight run",
        "the route recomputes whenever an endpoint object moves or resizes",
        "the ROUTES block in the apply result reports the true routed polyline and names every box the wire crosses (`through`)",
      ],
    },
    {
      topic: "steering",
      items: [
        {
          point: "three levels of control, coarsest first",
          subpoints: [
            "anchor pins which side the wire leaves or enters",
            "position pins the exact point on that side, as 0..1 fractions of the box",
            "waypoints force the path through world points",
          ],
        },
      ],
    },
  ],
  tips: [
    "wire object to object first, then read ROUTES before judging it done — a clean wire crosses nothing, so aim for an empty `through`",
    "place endpoints on a common axis for a direct route first; when steering is needed, try an anchor before pinning a position and use waypoints only when the corridor demands it",
    "when a route detours around the board or hugs a frame edge, bring related regions closer, use aligned endpoints, or move the obstructing note or object before adding waypoints",
  ],
};
