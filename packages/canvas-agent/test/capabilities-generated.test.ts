/**
 * Capabilities block gate. The checked-in generated fragments stay
 * byte-identical to scripts/generate-capabilities.ts, every validator roster
 * value is documented, and every model-facing operation is declared inside
 * its entity-kind section. The loader serves the assembled four-section text
 * as one static context block.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { CANVAS_COLORS } from "@codecaine-ai/canvas/schema";
import type { InteractiveCanvasObjectType } from "@codecaine-ai/canvas/schema";
import { OBJECT_TYPE_DEFAULTS } from "../../canvas/src/state/schema/object-defaults";
import { ICON_GLYPH_IDS } from "../../canvas/src/objects/shapes/icon/icon-glyphs";

import { renderVocabularyModule } from "../scripts/generate-capabilities";
import {
  CAPABILITIES_CONNECTION_FIELDS_GENERATED,
  CAPABILITIES_OBJECTS_GENERATED,
  formatCapabilities,
} from "../src/agent/catalog/layout-editor/context/capabilities";
import { capabilitiesLoader } from "../src/agent/loaders/capabilities";
import {
  MODEL_OPERATION_KINDS,
  type ModelOperationKind,
} from "../src/service/session/op-surface";

const GENERATED_FILE = join(
  import.meta.dir,
  "..", "src", "agent", "catalog", "layout-editor", "context", "capabilities",
  "vocabulary.generated.ts",
);

const SECTION_HEADERS = [
  "<sections>",
  "<stickies>",
  "<objects>",
  "<connections>",
] as const;

const OPS_BY_SECTION = {
  [SECTION_HEADERS[0]]: ["addSection", "updateSection", "removeSection", "fitSection"],
  [SECTION_HEADERS[1]]: ["addSticky", "updateSticky", "removeSticky"],
  [SECTION_HEADERS[2]]: ["addObject", "updateObject", "removeObject"],
  [SECTION_HEADERS[3]]: ["addConnection", "updateConnection", "removeConnection"],
} as const satisfies Record<(typeof SECTION_HEADERS)[number], readonly ModelOperationKind[]>;

function sectionText(block: string, headerIndex: number): string {
  const start = block.indexOf(SECTION_HEADERS[headerIndex]);
  const nextHeader = SECTION_HEADERS[headerIndex + 1];
  const end = nextHeader === undefined ? block.length : block.indexOf(nextHeader);
  expect(start, SECTION_HEADERS[headerIndex]).toBeGreaterThanOrEqual(0);
  expect(end, `end of ${SECTION_HEADERS[headerIndex]}`).toBeGreaterThan(start);
  return block.slice(start, end);
}

describe("capabilities generated fragments", () => {
  test("the checked-in module is fresh (re-run bun scripts/generate-capabilities.ts)", () => {
    expect(readFileSync(GENERATED_FILE, "utf8")).toBe(renderVocabularyModule());
  });

  test("every addObject-legal type appears in the emitted roster, sizeless", () => {
    const lines = CAPABILITIES_OBJECTS_GENERATED.split("\n").map((entry) => entry.trimStart());
    for (const type of Object.keys(OBJECT_TYPE_DEFAULTS)) {
      const line = lines.find((entry) => entry === type || entry.startsWith(`${type} —`));
      if (type === "section" || type === "sticky") {
        expect(line, `${type} belongs to its own kind section, not the object roster`).toBeUndefined();
        continue;
      }

      expect(line, type).toBeDefined();
      expect(line!, type).not.toMatch(/\d+×\d+/);
    }
  });

  test("field contracts the contact sheet cannot show stay on their roster lines", () => {
    const lines = CAPABILITIES_OBJECTS_GENERATED.split("\n");
    const lineFor = (type: InteractiveCanvasObjectType): string =>
      lines.find((entry) => entry.trimStart().startsWith(`${type} —`)) ?? "";
    for (const type of ["arrow-shape", "chevron", "parallelogram", "triangle"] as const) {
      expect(lineFor(type), type).toContain("`direction`");
    }
    expect(lineFor("icon")).toContain("`icon` field");
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

  test("every icon glyph is listed out under special, one per line", () => {
    const lines = CAPABILITIES_OBJECTS_GENERATED.split("\n");
    const iconAt = lines.findIndex((line) => line.trimStart().startsWith("icon —"));
    expect(iconAt).toBeGreaterThan(-1);
    expect(lines[iconAt]!).toContain("`icon` field");
    for (const [offset, id] of ICON_GLYPH_IDS.entries()) {
      expect(lines[iconAt + 1 + offset]!.trimStart(), id).toStartWith(id);
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
      "these rosters are closed — draw every type, color, and glyph from them",
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

  test("declares every model-facing op inside its own entity-kind section", () => {
    const block = formatCapabilities();
    const declaredKinds = new Set<ModelOperationKind>();
    // Each entry is headed by the tool the model calls; field shape lives on
    // that tool's parameter schema rather than in this block.
    const toolName = (kind: string) =>
      kind.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
    const declaresTool = (text: string, kind: string) =>
      text.split("\n").some((line) => line.trim() === toolName(kind));

    for (const [headerIndex, header] of SECTION_HEADERS.entries()) {
      const ownSection = sectionText(block, headerIndex);
      for (const kind of OPS_BY_SECTION[header]) {
        expect(declaresTool(ownSection, kind), `${kind} in ${header}`).toBe(true);
        declaredKinds.add(kind);
      }
    }

    expect([...declaredKinds].sort()).toEqual([...MODEL_OPERATION_KINDS].sort());
    for (const kind of MODEL_OPERATION_KINDS) {
      expect(declaresTool(block, kind), kind).toBe(true);
    }
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
