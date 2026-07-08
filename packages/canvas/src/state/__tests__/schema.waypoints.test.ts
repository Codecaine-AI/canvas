import { describe, expect, it } from "bun:test";
import syntheticCanvas from "../../../../../canvases/synthetic.canvas.json";
import v2FlowSampleDocumentJson from "../../../../../canvases/v2-flow-interactive.canvas.json";
import { validateInteractiveCanvasDocument } from "../schema";
import type { InteractiveCanvasDocument } from "../schema";

const syntheticCanvasDocument = syntheticCanvas as InteractiveCanvasDocument;
const v2FlowSampleDocument = v2FlowSampleDocumentJson as InteractiveCanvasDocument;

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
        text: "A",
        geometry: { x: 0, y: 0, width: 100, height: 60 },
      },
      {
        id: "b",
        type: "process",
        text: "B",
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
  it("migrates legacy connection styles at the validation load boundary", () => {
    const cases: Array<[unknown, "solid" | "dashed"]> = [
      ["solid", "solid"],
      ["dashed", "dashed"],
      ["dotted", "dashed"],
      ["elbow", "solid"],
      ["smooth", "solid"],
      ["mystery", "solid"],
      [undefined, "solid"],
    ];

    for (const [rawStyle, expected] of cases) {
      const doc = baseDocument({
        connectionExtra: rawStyle === undefined ? {} : { style: rawStyle },
      });
      const result = validateInteractiveCanvasDocument(doc);

      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.document.connections[0]?.style).toBe(expected);
    }
  });

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

  it("still validates the v2-flow canvas JSON unchanged (no position/waypoints present)", () => {
    const result = validateInteractiveCanvasDocument(v2FlowSampleDocument);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const connection of result.document.connections) {
      expect(connection.from.position).toBeUndefined();
      expect(connection.to.position).toBeUndefined();
      expect(connection.waypoints).toBeUndefined();
    }
  });

  it("still validates the synthetic canvas JSON unchanged", () => {
    const result = validateInteractiveCanvasDocument(syntheticCanvasDocument);
    expect(result.ok).toBe(true);
  });
});
