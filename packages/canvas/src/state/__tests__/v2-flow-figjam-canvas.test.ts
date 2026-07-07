import { describe, expect, it } from "bun:test";
import v2FlowCanvas from "../../../../../canvases/v2-flow.canvas.json";
import { validateInteractiveCanvasDocument, type InteractiveCanvasDocument } from "../schema";
import { CONNECTOR_COLORS } from "../../objects/connector/def";
import { PASTEL_PAIRS } from "../../objects/shapes/pastels";
import { STICKY_COLORS } from "../../objects/sticky/colors";
import {
  resolveObjectColors,
  resolveObjectStrokeWidth,
  SECTION_FAMILIES,
  type SectionFamily,
} from "../../theme";

const v2FlowDocument = v2FlowCanvas as InteractiveCanvasDocument;

type Waypoint = readonly [number, number];

function expectWaypointClose(actual: readonly number[] | undefined, expected: Waypoint): void {
  expect(actual).toBeDefined();
  expect(actual?.[0]).toBeCloseTo(expected[0], 6);
  expect(actual?.[1]).toBeCloseTo(expected[1], 6);
}

function shiftedWaypoint(point: Waypoint): Waypoint {
  const pageFrame = v2FlowDocument.objects.find((object) => object.id === "page-frame");
  if (!pageFrame) throw new Error("v2-flow canvas is missing page-frame");
  return [
    point[0] + pageFrame.geometry.x - 40,
    point[1] + pageFrame.geometry.y - 40,
  ];
}

describe("v2-flow canvas JSON", () => {
  it("passes schema validation with no hard errors", () => {
    const result = validateInteractiveCanvasDocument(v2FlowDocument);
    if (!result.ok) {
      throw new Error(
        `Canvas JSON failed validation: ${result.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
      );
    }
    expect(result.ok).toBe(true);
  });

  it("produces no unexpected validation warnings (e.g. unknown paletteToken)", () => {
    const result = validateInteractiveCanvasDocument(v2FlowDocument);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings ?? []).toEqual([]);
    }
  });

  it("has the expected object type inventory", () => {
    const counts = new Map<string, number>();
    for (const object of v2FlowDocument.objects) {
      counts.set(object.type, (counts.get(object.type) ?? 0) + 1);
    }
    // Sections: page frame + Interview Inputs + General + Questions + Q1/Q2/QN
    // + Interview Flow + Memory Bank + Memory Actions + Structure
    // + Next Question Response + Probing Response = 13
    expect(counts.get("section")).toBe(13);
    // Stickies: overall-context, base-question-text, memory-bank = 3
    expect(counts.get("sticky")).toBe(3);
    // Pills: overall-context + (Q1/Q2/QN x2) = 7
    expect(counts.get("pill")).toBe(7);
    // Chip icons: generate-transition-response, adapt-question, generate-probing-question = 3
    expect(counts.get("chip-icon")).toBe(3);
    expect(counts.get("chat")).toBe(1);
    expect(counts.get("person")).toBe(1);
    // Predefined process: New/Update/Delete/No Change Memory + Get Next Question = 5
    expect(counts.get("predefined-process")).toBe(5);
    expect(counts.get("code-block")).toBe(2);
    // Arrow shapes (chevrons): 3 left + 3 right = 6
    expect(counts.get("arrow-shape")).toBe(6);
    // Emphasis box modeled as text/rounded-rect
    expect(counts.get("text")).toBe(1);
  });

  it("has a non-trivial connector network", () => {
    expect(v2FlowDocument.connections.length).toBeGreaterThanOrEqual(20);
  });

  it("every connection endpoint references an existing object", () => {
    const objectIds = new Set(v2FlowDocument.objects.map((object) => object.id));
    for (const connection of v2FlowDocument.connections) {
      expect(objectIds.has(connection.from.objectId)).toBe(true);
      expect(objectIds.has(connection.to.objectId)).toBe(true);
    }
  });

  it("every object parentId (when set) references an existing section", () => {
    // W6 — sections are the only legal parent; containment via parentId.
    const objectById = new Map(v2FlowDocument.objects.map((object) => [object.id, object]));
    for (const object of v2FlowDocument.objects) {
      if (object.parentId) {
        expect(objectById.get(object.parentId)?.type).toBe("section");
      }
    }
  });

  it("every section tint is a known SECTION_FAMILIES key from theme/tokens", () => {
    const knownTints = new Set(Object.keys(SECTION_FAMILIES) as SectionFamily[]);
    for (const object of v2FlowDocument.objects) {
      if (object.type === "section") {
        expect(object.tint).toBeDefined();
        expect(knownTints.has(object.tint as SectionFamily)).toBe(true);
      }
    }
  });

  it("every connector color is a known CONNECTOR_COLORS hex value from theme/tokens", () => {
    const knownColors = new Set(Object.values(CONNECTOR_COLORS));
    for (const connection of v2FlowDocument.connections) {
      expect(connection.color).toBeDefined();
      expect(knownColors.has(connection.color as (typeof CONNECTOR_COLORS)[keyof typeof CONNECTOR_COLORS])).toBe(
        true,
      );
    }
  });

  it("every section has a title (required for rendering the title chip)", () => {
    for (const object of v2FlowDocument.objects) {
      if (object.type === "section") {
        expect(object.title && object.title.trim().length > 0).toBe(true);
      }
    }
  });

  it("both stickies with author metadata are attributed to ford", () => {
    const stickies = v2FlowDocument.objects.filter((object) => object.type === "sticky");
    expect(stickies.length).toBe(3);
    for (const sticky of stickies) {
      expect(sticky.author).toBe("ford");
    }
  });

  it("code blocks specify a language for the tokenizer", () => {
    const codeBlocks = v2FlowDocument.objects.filter((object) => object.type === "code-block");
    expect(codeBlocks.length).toBe(2);
    const languages = codeBlocks.map((block) => block.language).sort();
    expect(languages).toEqual(["json", "python"]);
  });

  it("pills carry the exact FigJam white fill + gray stroke pair", () => {
    const pills = v2FlowDocument.objects.filter((object) => object.type === "pill");
    expect(pills.length).toBe(7);
    for (const pill of pills) {
      expect(pill.style?.fill).toBe("#FFFFFF");
      expect(pill.style?.stroke).toBe("#757575");
      // No explicit strokeWidth — FigJam's universal 4px default applies.
      expect(resolveObjectStrokeWidth(pill.style)).toBe(4);
    }
  });

  it("chevrons carry the exact PASTEL_PAIRS.yellow fill/stroke pair", () => {
    const chevrons = v2FlowDocument.objects.filter((object) => object.type === "arrow-shape");
    expect(chevrons.length).toBe(6);
    for (const chevron of chevrons) {
      expect(chevron.style?.fill).toBe(PASTEL_PAIRS.yellow.fill);
      expect(chevron.style?.stroke).toBe(PASTEL_PAIRS.yellow.stroke);
    }
  });

  it("predefined-process buttons carry the exact PASTEL_PAIRS.blue fill/stroke pair", () => {
    const buttons = v2FlowDocument.objects.filter(
      (object) => object.type === "predefined-process",
    );
    expect(buttons.length).toBe(5);
    for (const button of buttons) {
      expect(button.style?.fill).toBe(PASTEL_PAIRS.blue.fill);
      expect(button.style?.stroke).toBe(PASTEL_PAIRS.blue.stroke);
    }
  });

  it("the emphasis box carries PASTEL_PAIRS.red with the user-thickened 8px stroke", () => {
    const emphasisBox = v2FlowDocument.objects.find(
      (object) => object.id === "emphasis-box-research-objective",
    );
    expect(emphasisBox?.style?.fill).toBe(PASTEL_PAIRS.red.fill);
    expect(emphasisBox?.style?.stroke).toBe(PASTEL_PAIRS.red.stroke);
    expect(emphasisBox?.style?.strokeWidth).toBe(8);
    expect(resolveObjectStrokeWidth(emphasisBox?.style)).toBe(8);
  });

  it("stickies resolve to the exact STICKY_COLORS hexes (no theme desaturation)", () => {
    const yellowSticky = v2FlowDocument.objects.find(
      (object) => object.id === "sticky-overall-context",
    );
    expect(resolveObjectColors(yellowSticky?.style).fill).toBe(STICKY_COLORS.yellow.bg);
    for (const id of ["sticky-base-question-text", "sticky-memory-bank"]) {
      const redSticky = v2FlowDocument.objects.find((object) => object.id === id);
      expect(resolveObjectColors(redSticky?.style).fill).toBe(STICKY_COLORS.red.bg);
    }
  });

  it("the three fan junctions share trunk waypoints (trunk-and-branch routing)", () => {
    const trunkOf = (ids: string[]) =>
      ids.map(
        (id) => v2FlowDocument.connections.find((connection) => connection.id === id)?.waypoints?.[0],
      );

    // Get Next Question fan: all three first waypoints share the trunk join.
    const gnqTrunk = trunkOf([
      "conn-get-next-question-to-enough-context",
      "conn-get-next-question-to-null-response",
      "conn-get-next-question-to-user-safety-refusal",
    ]);
    for (const waypoint of gnqTrunk) {
      expectWaypointClose(waypoint, shiftedWaypoint([1915, 1683]));
    }

    // Emphasis-box left + right fans.
    const leftTrunk = trunkOf([
      "conn-emphasis-box-to-enough-context",
      "conn-emphasis-box-to-null-response",
      "conn-emphasis-box-to-user-safety-refusal",
    ]);
    for (const waypoint of leftTrunk) {
      expectWaypointClose(waypoint, shiftedWaypoint([2385, 1683.5]));
    }
    const rightTrunk = trunkOf([
      "conn-emphasis-box-to-not-enough-context",
      "conn-emphasis-box-to-unclear-message",
      "conn-emphasis-box-to-possible-user-refusal",
    ]);
    for (const waypoint of rightTrunk) {
      expectWaypointClose(waypoint, shiftedWaypoint([2985, 1683.5]));
    }

    // GPQ loop: all three share the horizontal trunk segment along y=1683.
    for (const id of [
      "conn-not-enough-context-to-generate-probing-question",
      "conn-unclear-message-to-generate-probing-question",
      "conn-possible-user-refusal-to-generate-probing-question",
    ]) {
      const connection = v2FlowDocument.connections.find((c) => c.id === id);
      const trunk = connection?.waypoints?.slice(-2);
      expectWaypointClose(trunk?.[0], shiftedWaypoint([3575, 1683]));
      expectWaypointClose(trunk?.[1], shiftedWaypoint([4668, 1683]));
    }
  });

  it("has no duplicate object or connection ids", () => {
    const ids = new Set<string>();
    for (const object of v2FlowDocument.objects) {
      expect(ids.has(object.id)).toBe(false);
      ids.add(object.id);
    }
    for (const connection of v2FlowDocument.connections) {
      expect(ids.has(connection.id)).toBe(false);
      ids.add(connection.id);
    }
  });
});
