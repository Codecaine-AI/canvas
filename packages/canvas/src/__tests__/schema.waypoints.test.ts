import { describe, expect, it } from "bun:test";
import { validateInteractiveCanvasDocument } from "../schema";
import { v2FlowInteractiveCanvas } from "../fixtures/v2-flow-canvas";
import { syntheticInteractiveCanvas } from "../fixtures/synthetic-canvas";

function baseDocument(overrides: {
  fromExtra?: Record<string, unknown>;
  toExtra?: Record<string, unknown>;
  connectionExtra?: Record<string, unknown>;
} = {}) {
  return {
    schemaVersion: 1,
    id: "waypoints-doc",
    mode: "diagram",
    objects: [
      {
        id: "a",
        type: "process",
        label: "A",
        geometry: { x: 0, y: 0, width: 100, height: 60 },
      },
      {
        id: "b",
        type: "process",
        label: "B",
        geometry: { x: 300, y: 0, width: 100, height: 60 },
      },
    ],
    connections: [
      {
        id: "a-to-b",
        from: { objectId: "a", anchor: "right", ...overrides.fromExtra },
        to: { objectId: "b", anchor: "left", ...overrides.toExtra },
        ...overrides.connectionExtra,
      },
    ],
  };
}

describe("schema — D33 thread B additions (position, waypoints)", () => {
  it("accepts and round-trips an endpoint `position`", () => {
    const doc = baseDocument({ fromExtra: { position: [0.5, 1] }, toExtra: { position: [0, 0.25] } });
    const result = validateInteractiveCanvasDocument(doc);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.connections[0]?.from.position).toEqual([0.5, 1]);
    expect(result.document.connections[0]?.to.position).toEqual([0, 0.25]);
  });

  it("accepts and round-trips connection `waypoints`", () => {
    const doc = baseDocument({
      connectionExtra: {
        waypoints: [
          [150, 30],
          [150, 120],
          [250, 120],
        ],
      },
    });
    const result = validateInteractiveCanvasDocument(doc);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.connections[0]?.waypoints).toEqual([
      [150, 30],
      [150, 120],
      [250, 120],
    ]);
  });

  it("omits `position` and `waypoints` when absent (both stay optional)", () => {
    const doc = baseDocument();
    const result = validateInteractiveCanvasDocument(doc);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.document.connections[0]?.from.position).toBeUndefined();
    expect(result.document.connections[0]?.to.position).toBeUndefined();
    expect(result.document.connections[0]?.waypoints).toBeUndefined();
  });

  it("rejects an out-of-range endpoint position", () => {
    const doc = baseDocument({ fromExtra: { position: [1.5, 0.5] } });
    const result = validateInteractiveCanvasDocument(doc);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path.includes("from.position"))).toBe(true);
  });

  it("rejects a negative endpoint position component", () => {
    const doc = baseDocument({ toExtra: { position: [-0.1, 0.5] } });
    const result = validateInteractiveCanvasDocument(doc);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path.includes("to.position"))).toBe(true);
  });

  it("rejects a non-finite / malformed endpoint position", () => {
    const doc = baseDocument({ fromExtra: { position: [0.5] } });
    const result = validateInteractiveCanvasDocument(doc);

    expect(result.ok).toBe(false);
  });

  it("rejects a waypoint entry that is not a finite [x, y] tuple", () => {
    const doc = baseDocument({ connectionExtra: { waypoints: [[100, 50], ["oops", 10]] } });
    const result = validateInteractiveCanvasDocument(doc);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((issue) => issue.path.includes("waypoints"))).toBe(true);
  });

  it("rejects non-array waypoints", () => {
    const doc = baseDocument({ connectionExtra: { waypoints: "not-an-array" } });
    const result = validateInteractiveCanvasDocument(doc);

    expect(result.ok).toBe(false);
  });

  it("still validates the v2-flow fixture unchanged (no position/waypoints present)", () => {
    const result = validateInteractiveCanvasDocument(v2FlowInteractiveCanvas);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const connection of result.document.connections) {
      expect(connection.from.position).toBeUndefined();
      expect(connection.to.position).toBeUndefined();
      expect(connection.waypoints).toBeUndefined();
    }
  });

  it("still validates the synthetic fixture unchanged", () => {
    const result = validateInteractiveCanvasDocument(syntheticInteractiveCanvas);
    expect(result.ok).toBe(true);
  });
});
