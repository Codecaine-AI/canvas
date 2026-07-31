/**
 * Capabilities block gate. The checked-in generated fragments stay
 * byte-identical to scripts/generate-capabilities.ts, the <vocabulary> XML
 * walks the object-preference registry in roster order, and every registered
 * gesture is declared inside its verb-group block — with nothing declared
 * that is not registered. The loader
 * serves the assembled material-then-gestures text as one static context
 * block.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CANVAS_COLORS } from "@codecaine-ai/canvas/schema";

import { OBJECT_PREFERENCES } from "../../canvas/src/objects/registry";
import { renderVocabularyModule } from "../scripts/generate-capabilities";
import { PLACEABLE_TYPES } from "../src/service/session/tools/placeable-types";
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

  test("renders one <object> element per registry entry, in roster order", () => {
    const names = CAPABILITIES_OBJECTS_GENERATED.split("\n")
      .map((line) => /^<object name="([^"]+)" preferred_color="([^"]+)">$/.exec(line))
      .filter((match): match is RegExpExecArray => match !== null);

    expect(names.map((match) => match[1])).toEqual(
      OBJECT_PREFERENCES.map((entry) => entry.name),
    );
    for (const [offset, entry] of OBJECT_PREFERENCES.entries()) {
      expect(names[offset]![2], entry.name).toBe(entry.color);
    }
  });

  test("the vocabulary is exactly the placeable roster — nothing offered is undocumented", () => {
    const listed = OBJECT_PREFERENCES.map((entry) => entry.name);
    expect([...listed].sort()).toEqual([...PLACEABLE_TYPES].sort());
  });

  test("every entry carries its meaning and one dash bullet per scenario", () => {
    const body = CAPABILITIES_OBJECTS_GENERATED;
    for (const entry of OBJECT_PREFERENCES) {
      const open = body.indexOf(`<object name="${entry.name}" `);
      const close = body.indexOf("</object>", open);
      expect(open, entry.name).toBeGreaterThanOrEqual(0);
      const element = body.slice(open, close);
      expect(element, entry.name).toContain(`<meaning>${entry.meaning}</meaning>`);
      for (const scenario of entry.scenarios) {
        expect(element, entry.name).toContain(`- ${scenario}`);
      }
    }
  });

  test("the carrier type and the kinds with their own gestures never reach the vocabulary", () => {
    for (const name of ["icon", "section", "sticky"]) {
      expect(CAPABILITIES_OBJECTS_GENERATED, name).not.toContain(`<object name="${name}"`);
    }
  });

  test("the color guidance sentence sits adjacent to the object listing", () => {
    const lines = CAPABILITIES_OBJECTS_GENERATED.split("\n");
    const lastElement = lines.lastIndexOf("</object>");
    expect(lastElement).toBeGreaterThan(-1);
    expect(lines[lastElement + 1]).toBe(
      "keep each object's preferred color; depart only when the object would sit "
        + "illegibly in its container",
    );
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
    // mention of connect, and "resizes" is not a mention of resize. `lock` is
    // allowed because it is also a placeable glyph NAME — the vocabulary's
    // <object name="lock"> element is an object entry, not a tool reference.
    const allowed = new Set(["fit_section", "lock"]);
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
