import { describe, expect, it } from "bun:test";
import v2FlowCanvas from "../../../../../canvases/v2-flow.canvas.json";
import { validateInteractiveCanvasDocument, type InteractiveCanvasDocument } from "../schema";
import { resolveStickyFill } from "../../theme/palette";

const v2FlowDocument = v2FlowCanvas as InteractiveCanvasDocument;

describe("v2-flow canvas JSON", () => {
  it("produces no unexpected validation warnings (e.g. unknown color id)", () => {
    const result = validateInteractiveCanvasDocument(v2FlowDocument);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings ?? []).toEqual([]);
    }
  });

  it("stickies migrated to picks that resolve to the exact classic sticky hexes", () => {
    const yellowSticky = v2FlowDocument.objects.find(
      (object) => object.id === "sticky-overall-context",
    );
    expect(yellowSticky?.color).toBe("yellow");
    expect(resolveStickyFill("yellow")).toBe("#FFE299");
    const greenSticky = v2FlowDocument.objects.find(
      (object) => object.id === "sticky-base-question-text",
    );
    expect(greenSticky?.color).toBe("green");
    expect(resolveStickyFill("green")).toBe("#C5E9CB");
    const redSticky = v2FlowDocument.objects.find((object) => object.id === "sticky-memory-bank");
    expect(redSticky?.color).toBe("red");
    expect(resolveStickyFill("red")).toBe("#FFBFB7");
  });

  it("explicit fan trunk waypoints survive only on the probing-question fan and the enough-context riser", () => {
    const connectionById = (id: string) =>
      v2FlowDocument.connections.find((connection) => connection.id === id);

    const withWaypoints = v2FlowDocument.connections
      .filter((connection) => connection.waypoints !== undefined)
      .map((connection) => connection.id)
      .sort();
    expect(withWaypoints).toEqual([
      "conn-get-next-question-to-enough-context",
      "conn-not-enough-context-to-generate-probing-question",
      "conn-possible-user-refusal-to-generate-probing-question",
      "conn-unclear-message-to-generate-probing-question",
    ]);

    // The three probing-question branches share their trunk x coordinates.
    const fanIds = [
      "conn-not-enough-context-to-generate-probing-question",
      "conn-unclear-message-to-generate-probing-question",
      "conn-possible-user-refusal-to-generate-probing-question",
    ];
    const reference = connectionById(fanIds[0]!)?.waypoints;
    expect(reference).toBeDefined();
    for (const id of fanIds) {
      const waypoints = connectionById(id)?.waypoints;
      expect(waypoints).toBeDefined();
      expect(waypoints?.[0]?.[0]).toBeCloseTo(reference![0]![0], 6);
      expect(waypoints?.[1]?.[0]).toBeCloseTo(reference![1]![0], 6);
    }
  });
});
