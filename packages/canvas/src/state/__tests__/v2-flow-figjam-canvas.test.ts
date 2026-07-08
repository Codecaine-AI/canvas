import { describe, expect, it } from "bun:test";
import v2FlowCanvas from "../../../../../canvases/v2-flow.canvas.json";
import {
  isCanvasColor,
  validateInteractiveCanvasDocument,
  type InteractiveCanvasDocument,
} from "../schema";
import { resolveShapeColors, resolveStickyFill } from "../../palette";
import { resolveObjectStrokeWidth } from "../../theme";

const v2FlowDocument = v2FlowCanvas as InteractiveCanvasDocument;

type Waypoint = readonly [number, number];

function expectWaypointClose(actual: readonly number[] | undefined, expected: Waypoint): void {
  expect(actual).toBeDefined();
  expect(actual?.[0]).toBeCloseTo(expected[0], 6);
  expect(actual?.[1]).toBeCloseTo(expected[1], 6);
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

  it("produces no unexpected validation warnings (e.g. unknown color id)", () => {
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
    // + Probing Response = 12
    expect(counts.get("section")).toBe(12);
    // Stickies: overall-context, base-question-text, memory-bank = 3
    expect(counts.get("sticky")).toBe(3);
    // Pills: overall-context + (Q1/Q2/QN x2) = 7
    expect(counts.get("pill")).toBe(7);
    // Icons include migrated chip/person/chat visuals plus existing icon glyph objects.
    expect(counts.get("icon")).toBe(10);
    const glyphCounts = new Map<string, number>();
    for (const object of v2FlowDocument.objects) {
      if (object.type === "icon") {
        glyphCounts.set(object.icon ?? "", (glyphCounts.get(object.icon ?? "") ?? 0) + 1);
      }
    }
    expect(glyphCounts.get("cpu")).toBe(4);
    expect(glyphCounts.get("chat")).toBe(2);
    expect(glyphCounts.get("person")).toBe(2);
    // Predefined process: New/Update/Delete/No Change Memory + Get Next Question = 5
    expect(counts.get("predefined-process")).toBe(5);
    expect(counts.get("code-block")).toBe(2);
    // Arrow shapes (chevrons): 3 left + 3 right = 6
    expect(counts.get("arrow-shape")).toBe(6);
    // Emphasis box modeled as rectangle/rounded-rect
    expect(counts.get("rectangle")).toBe(1);
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

  it("every section color is a valid CanvasColor pick (P1 — the tint field is gone)", () => {
    for (const object of v2FlowDocument.objects) {
      if (object.type === "section") {
        expect(object.color).toBeDefined();
        expect(isCanvasColor(object.color)).toBe(true);
      }
    }
  });

  it("every connector color is a valid CanvasColor pick (P1 — raw hexes are gone)", () => {
    for (const connection of v2FlowDocument.connections) {
      expect(connection.color).toBeDefined();
      expect(isCanvasColor(connection.color)).toBe(true);
    }
  });

  it("every section has non-empty text for rendering the title chip", () => {
    for (const object of v2FlowDocument.objects) {
      if (object.type === "section") {
        expect(object.text.trim().length).toBeGreaterThan(0);
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

  it("pills migrated to the bold white pick (FigJam white fill + gray border)", () => {
    const pills = v2FlowDocument.objects.filter((object) => object.type === "pill");
    expect(pills.length).toBe(7);
    for (const pill of pills) {
      expect(pill.color).toBe("white");
      expect(resolveShapeColors("white")).toEqual({ fill: "#FFFFFF", border: "#757575" });
      // No explicit strokeWidth — FigJam's universal 4px default applies.
      expect(resolveObjectStrokeWidth(pill.style)).toBe(4);
    }
  });

  it("chevrons migrated to the yellow pick", () => {
    const chevrons = v2FlowDocument.objects.filter((object) => object.type === "arrow-shape");
    expect(chevrons.length).toBe(6);
    for (const chevron of chevrons) {
      expect(chevron.color).toBe("yellow");
    }
    expect(resolveShapeColors("yellow")).toEqual({ fill: "#FFECBD", border: "#E8A302" });
  });

  it("predefined-process buttons migrated to the blue pick", () => {
    const buttons = v2FlowDocument.objects.filter(
      (object) => object.type === "predefined-process",
    );
    expect(buttons.length).toBe(5);
    for (const button of buttons) {
      expect(button.color).toBe("blue");
    }
    expect(resolveShapeColors("blue")).toEqual({ fill: "#C2E5FF", border: "#0D99FF" });
  });

  it("the emphasis box migrated to soft red and keeps the user-thickened 8px stroke", () => {
    const emphasisBox = v2FlowDocument.objects.find(
      (object) => object.id === "emphasis-box-research-objective",
    );
    expect(emphasisBox?.color).toBe("red");
    expect(emphasisBox?.style?.strokeWidth).toBe(8);
    expect(resolveObjectStrokeWidth(emphasisBox?.style)).toBe(8);
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
    expect(resolveStickyFill("green")).toBe("#DDF8E2");
    const redSticky = v2FlowDocument.objects.find((object) => object.id === "sticky-memory-bank");
    expect(redSticky?.color).toBe("red");
    expect(resolveStickyFill("red")).toBe("#FFAFA3");
  });

  it("explicit fan junction waypoints share their trunk points", () => {
    const connectionById = (id: string) =>
      v2FlowDocument.connections.find((connection) => connection.id === id);
    const firstWaypoint = (id: string) => connectionById(id)?.waypoints?.[0];
    const expectSharedFirstWaypoint = (ids: string[]) => {
      const reference = firstWaypoint(ids[0]!);
      expect(reference).toBeDefined();
      for (const id of ids) {
        expectWaypointClose(firstWaypoint(id), reference as Waypoint);
      }
    };

    // These fan groups now rely on auto-routing instead of explicit waypoint arrays.
    for (const id of [
      "conn-get-next-question-to-enough-context",
      "conn-get-next-question-to-null-response",
      "conn-get-next-question-to-user-safety-refusal",
      "conn-not-enough-context-to-generate-probing-question",
      "conn-unclear-message-to-generate-probing-question",
      "conn-possible-user-refusal-to-generate-probing-question",
    ]) {
      expect(connectionById(id)?.waypoints).toBeUndefined();
    }

    // The remaining explicit emphasis-box branches keep their shared trunk joins;
    // the other branches now rely on auto-routing.
    for (const id of [
      "conn-emphasis-box-to-enough-context",
      "conn-emphasis-box-to-null-response",
    ]) {
      expect(connectionById(id)?.waypoints).toBeUndefined();
    }
    expect(connectionById("conn-emphasis-box-to-user-safety-refusal")?.waypoints).toBeDefined();
    expectSharedFirstWaypoint([
      "conn-emphasis-box-to-not-enough-context",
      "conn-emphasis-box-to-unclear-message",
      "conn-emphasis-box-to-possible-user-refusal",
    ]);
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
