/**
 * Capabilities block gate. The checked-in generated fragments stay
 * byte-identical to scripts/generate-capabilities.ts, every validator roster
 * value is documented, and every registered gesture is declared inside its
 * verb-group block — with nothing declared that is not registered. The loader
 * serves the assembled material-then-gestures text as one static context
 * block.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CANVAS_COLORS } from "@codecaine-ai/canvas/schema";
import type { InteractiveCanvasObjectType } from "@codecaine-ai/canvas/schema";
import { OBJECT_TYPE_DEFAULTS } from "../../canvas/src/state/schema/object-defaults";

import { renderVocabularyModule } from "../scripts/generate-capabilities";
import {
  GLYPH_COLLISIONS,
  PLACEABLE_GLYPH_TYPES,
  PLACEABLE_SHAPE_TYPES,
  PLACEABLE_TYPES,
  READ_ONLY_TYPE_NAMES,
} from "../src/service/session/tools/placeable-types";
import {
  CAPABILITIES_CONNECTION_FIELDS_GENERATED,
  CAPABILITIES_OBJECTS_GENERATED,
  OP_REFERENCE,
  formatCapabilities,
  gestureGroups,
} from "../src/catalog/layout-editor/context/capabilities";
import { capabilitiesLoader } from "../src/service/loaders/capabilities";
import { operationTools } from "../src/service/session/tools/operations";

const GENERATED_FILE = join(
  import.meta.dir,
  "..", "src", "catalog", "layout-editor", "context", "capabilities",
  "vocabulary.generated.ts",
);

/**
 * The body of one verb-group block inside <gestures>. Searched from the
 * <gestures> tag on, because two group tags — <sections> above all — repeat a
 * kind tag from the material half, deliberately: the kind block is the frame,
 * the gesture block is what you do to one.
 */
function groupText(block: string, group: string): string {
  const gestures = gesturesAt(block);
  const open = block.indexOf(`<${group}>`, gestures);
  const close = block.indexOf(`</${group}>`, open);
  expect(open, `<${group}>`).toBeGreaterThanOrEqual(0);
  expect(close, `</${group}>`).toBeGreaterThan(open);
  return block.slice(open, close);
}

/**
 * Where the gesture half starts. Matched at the line start, because the header
 * prose names the tag it is pointing the reader at.
 */
function gesturesAt(block: string): number {
  const at = block.indexOf("\n<gestures>");
  expect(at, "<gestures>").toBeGreaterThan(0);
  return at;
}

/** A tool is DECLARED where its name stands alone as a heading line. */
function declaresTool(text: string, tool: string): boolean {
  return text.split("\n").some((line) => line.trim() === tool);
}

describe("capabilities generated fragments", () => {
  test("the checked-in module is fresh (re-run bun scripts/generate-capabilities.ts)", () => {
    expect(readFileSync(GENERATED_FILE, "utf8")).toBe(renderVocabularyModule());
  });

  test("every placeable shape type appears in the emitted roster, sizeless", () => {
    const lines = CAPABILITIES_OBJECTS_GENERATED.split("\n").map((entry) => entry.trimStart());
    for (const type of Object.keys(OBJECT_TYPE_DEFAULTS)) {
      const line = lines.find((entry) => entry === type || entry.startsWith(`${type} —`));
      if (type === "section" || type === "sticky") {
        expect(line, `${type} belongs to its own kind section, not the object roster`).toBeUndefined();
        continue;
      }
      if (type === "icon") {
        // The carrier type is folded away: glyphs are types of their own
        // (src/service/session/placeable-types.ts), so "icon" is not a name
        // the model can place or read.
        expect(line, "the icon carrier type never reaches the roster").toBeUndefined();
        continue;
      }
      if (!(PLACEABLE_SHAPE_TYPES as readonly string[]).includes(type)) {
        // A shape whose bare name a glyph took in the collision audit: it is
        // read-only, so neither the shape nor its outbound name is offered.
        // (The bare name IS on the roster — as the glyph's line.)
        expect(READ_ONLY_TYPE_NAMES as readonly string[], type).toContain(`${type}-shape`);
        expect(lines, type).not.toContain(`${type}-shape`);
        continue;
      }

      expect(line, type).toBeDefined();
      expect(line!, type).not.toMatch(/\d+×\d+/);
    }
  });

  test("the roster is exactly the folded placeable vocabulary", () => {
    const listed = CAPABILITIES_OBJECTS_GENERATED.split("\n")
      .filter((line) => line.startsWith("        "))
      .map((line) => line.trimStart().split(" —")[0]!.split(" (")[0]!);
    expect([...listed].sort()).toEqual([...PLACEABLE_TYPES].sort());
  });

  test("field contracts the contact sheet cannot show stay on their roster lines", () => {
    const lines = CAPABILITIES_OBJECTS_GENERATED.split("\n");
    const lineFor = (type: InteractiveCanvasObjectType): string =>
      lines.find((entry) => entry.trimStart().startsWith(`${type} —`)) ?? "";
    for (const type of ["arrow-shape", "chevron", "parallelogram", "triangle"] as const) {
      expect(lineFor(type), type).toContain("`direction`");
    }
  });

  test("no `icon` field contract survives anywhere in the block", () => {
    expect(formatCapabilities()).not.toContain("`icon`");
  });

  test("every canvas color is listed out, one per line", () => {
    const lines = CAPABILITIES_OBJECTS_GENERATED.split("\n");
    const header = lines.indexOf("colors (objects and connections), one per line:");
    expect(header).toBeGreaterThan(-1);
    const trimmed = lines.map((line) => line.trimStart());
    for (const color of CANVAS_COLORS) {
      expect(trimmed, color).toContain(color);
    }
  });

  test("every placeable glyph is a type under the icons group, one per line", () => {
    const lines = CAPABILITIES_OBJECTS_GENERATED.split("\n");
    const groupAt = lines.findIndex((line) => line.trimStart().startsWith("icons —"));
    expect(groupAt).toBeGreaterThan(-1);
    for (const [offset, placeableType] of PLACEABLE_GLYPH_TYPES.entries()) {
      expect(lines[groupAt + 1 + offset]!.trimStart(), placeableType).toStartWith(placeableType);
    }
    // The group is the last one, so the glyph list runs to the colors header.
    expect(lines[groupAt + 1 + PLACEABLE_GLYPH_TYPES.length]).toStartWith("colors");
  });

  test("a collision offers the winner's bare name and nothing for the loser", () => {
    const listed = CAPABILITIES_OBJECTS_GENERATED.split("\n").map((line) => line.trimStart());
    for (const collision of GLYPH_COLLISIONS) {
      // Whoever won, the bare name is on the roster once and means one drawing.
      expect(listed, collision.glyph).toContain(collision.glyph);
      expect(
        listed.filter((line) => line === collision.glyph).length,
        collision.glyph,
      ).toBe(1);
      if (collision.decision === "glyph-wins") {
        // The bare name is the glyph's; the shape it outranked is read-only.
        expect(listed, collision.glyph).not.toContain(`${collision.glyph}-shape`);
        expect(listed, collision.glyph).not.toContain(`${collision.glyph}-icon`);
      } else {
        // The bare name is the shape's; the glyph is reachable beside it.
        expect(listed, collision.glyph).toContain(`${collision.glyph}-icon`);
      }
    }
  });

  test("emits the connection fields fragment", () => {
    expect(CAPABILITIES_CONNECTION_FIELDS_GENERATED.split("\n")).toEqual([
      "endpoint anchor: top | right | bottom | left | center — pins the side the wire uses; omit for automatic",
      "endpoint position: [x,y] fractions 0..1 of the box, a finer pin than anchor",
      "arrow: none | forward | back | both (default forward)",
      "style: solid | dashed (default solid)",
      "waypoints: [x,y] world points the route must pass through",
    ]);
  });

  test("closes the generated object rosters", () => {
    expect(CAPABILITIES_OBJECTS_GENERATED.split("\n").at(-1)).toBe(
      "these rosters are closed — draw every type and color from them",
    );
  });
});

describe("capabilities assembly", () => {
  test("keeps spacing and size numbers in the workflow prompt", () => {
    const block = formatCapabilities();
    expect(block).not.toMatch(/\d+×\d+/);
    expect(block).not.toContain("288");
    expect(block).not.toContain("224");
    expect(block).not.toContain("160");
    expect(block).not.toContain("144");
    expect(block).not.toContain("72 ");
    expect(block).not.toContain("15% ");
  });

  test("declares every registered gesture inside its own verb-group block", () => {
    const block = formatCapabilities();
    const declared = new Set<string>();

    // The <gestures> half is emitted by walking the registration roster, so
    // this walks the same roster back: every tool the model can call is headed
    // in exactly one group, and every group's tools are the roster's.
    for (const { group, tools } of gestureGroups()) {
      const ownGroup = groupText(block, group);
      for (const tool of tools) {
        expect(declaresTool(ownGroup, tool), `${tool} in <${group}>`).toBe(true);
        declared.add(tool);
      }
    }

    const registered = operationTools.map((tool) => tool.name);
    expect([...declared].sort()).toEqual([...registered].sort());
    // Nothing documented that nobody registers — the guard in ops.ts throws at
    // import, and this is the assertion that says so out loud.
    expect(Object.keys(OP_REFERENCE).sort()).toEqual([...registered].sort());
  });

  test("the material half names no tools — kinds describe the stuff, gestures the verbs", () => {
    const block = formatCapabilities();
    const material = block.slice(block.indexOf("<sections>"), gesturesAt(block));
    // fit_section is the one gesture a kind block still names, because "a
    // frame never fits itself, and this is what closes it" is a fact about
    // sections, not a tool reference. Whole words only: "connections" is not a
    // mention of connect, and "resizes" is not a mention of resize.
    const allowed = new Set(["fit_section"]);
    for (const tool of operationTools.map((entry) => entry.name)) {
      if (allowed.has(tool)) continue;
      expect(material, tool).not.toMatch(new RegExp(`\\b${tool}\\b`));
    }
  });

  test("says the grid once, at the top, and says it snaps", () => {
    const block = formatCapabilities();
    const header = block.slice(0, block.indexOf("<sections>"));
    expect(header).toContain("20 grid");
    expect(header).toContain("rounded to the nearest 20");
    expect(block.split("20 grid")).toHaveLength(2);
  });
});

describe("capabilities loader", () => {
  test("is static: same bytes every resolve, sessionData ignored", async () => {
    const a = await capabilitiesLoader.resolve({ kind: "capabilities" }, { cwd: "/" });
    const b = await capabilitiesLoader.resolve(
      { kind: "capabilities" },
      { cwd: "/elsewhere", sessionData: { boardState: "ignored" } },
    );
    expect(a.status).toBe("ok");
    expect(a.content).toBe(b.content);
    expect(a.content).toBe(formatCapabilities());
  });
});
