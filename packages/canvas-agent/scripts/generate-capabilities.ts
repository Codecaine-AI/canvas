/**
 * Emits src/catalog/layout-editor/context/capabilities/
 * vocabulary.generated.ts
 * with the schema-derived fragments used by the OBJECTS and CONNECTIONS
 * sections of the <capabilities> context block. The source tables are the
 * same ones the operation schemas declare: OBJECT_TYPE_DEFAULTS (the
 * object-type table), the folded placeable roster (src/service/session/
 * placeable-types.ts — icon glyphs ARE types here, no `icon` field is ever
 * mentioned), CANVAS_COLORS (the closed color roster), the icon glyph
 * registry (human labels), and the connection enums. Roster lines carry name
 * and default size only — the boot-time contact sheet is the visual
 * reference — plus a functional note on the few types with an extra field
 * contract.
 *
 * The exhaustive Records below require every schema member to have a
 * display-group and enum roster entry. test/capabilities-generated.test.ts
 * also keeps the checked-in module byte-identical to this generator's output.
 *
 * Idempotent: bun scripts/generate-capabilities.ts
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { CANVAS_COLORS } from "@codecaine-ai/canvas/schema";
import type {
  CanvasArrowDirection,
  CanvasConnectionStyle,
  InteractiveCanvasObjectType,
} from "@codecaine-ai/canvas/schema";
import type { Anchor } from "../../canvas/src/state/schema/connections";
import { OBJECT_TYPE_DEFAULTS } from "../../canvas/src/state/schema/object-defaults";
import { ICON_GLYPHS } from "../../canvas/src/objects/shapes/icon/icon-glyphs";
import {
  PLACEABLE_GLYPH_TYPES,
  PLACEABLE_SHAPE_TYPES,
  glyphForPlaceableType,
  type PlaceableGlyphType,
} from "../src/service/session/tools/placeable-types";

// ---------------------------------------------------------------------------
// Connection enums — runtime lists checked against the schema types. Adding a
// member to any of these unions makes the corresponding Record incomplete,
// so the generator stops compiling until the roster is updated.
// ---------------------------------------------------------------------------

const ANCHOR_SIDES = ["top", "right", "bottom", "left"] as const satisfies readonly Anchor[];
const _anchorsExhaustive: Record<Anchor, true> = {
  top: true, right: true, bottom: true, left: true,
};
void _anchorsExhaustive;

const ARROW_KINDS = [
  "none", "forward", "back", "both",
] as const satisfies readonly CanvasArrowDirection[];
const _arrowsExhaustive: Record<CanvasArrowDirection, true> = {
  none: true, forward: true, back: true, both: true,
};
void _arrowsExhaustive;

const STYLE_KINDS = ["solid", "dashed"] as const satisfies readonly CanvasConnectionStyle[];
const _stylesExhaustive: Record<CanvasConnectionStyle, true> = { solid: true, dashed: true };
void _stylesExhaustive;

// ---------------------------------------------------------------------------
// Object-type grouping. The roster CONTENT comes from OBJECT_TYPE_DEFAULTS;
// this Record only assigns each type a display group, and its exhaustiveness
// forces a grouping decision whenever a type joins the schema.
// ---------------------------------------------------------------------------

type TypeGroup = "containers" | "flowchart" | "geometric" | "notes" | "special";

const TYPE_GROUPS: Record<InteractiveCanvasObjectType, TypeGroup> = {
  section: "containers",
  process: "flowchart",
  decision: "flowchart",
  database: "flowchart",
  document: "flowchart",
  "document-stack": "flowchart",
  "predefined-process": "flowchart",
  "off-page-connector": "flowchart",
  "manual-input": "flowchart",
  "internal-storage": "flowchart",
  "or-junction": "flowchart",
  "summing-junction": "flowchart",
  "cylinder-horizontal": "flowchart",
  "page-corner": "flowchart",
  rectangle: "geometric",
  ellipse: "geometric",
  triangle: "geometric",
  parallelogram: "geometric",
  pentagon: "geometric",
  hexagon: "geometric",
  octagon: "geometric",
  star: "geometric",
  plus: "geometric",
  chevron: "geometric",
  trapezoid: "geometric",
  pill: "geometric",
  "arrow-shape": "geometric",
  folder: "geometric",
  sticky: "notes",
  icon: "special",
};

// Sections and stickies have their own kind sections, so their groups never
// reach the OBJECTS roster — it lists exactly what addObject accepts.
type EmittedTypeGroup = Exclude<TypeGroup, "containers" | "notes">;

const EMITTED_GROUP_ORDER: readonly EmittedTypeGroup[] = [
  "flowchart", "geometric", "special",
];

/**
 * Group headings. "special" holds the icon family, and since the glyph roster
 * is folded into the type vocabulary (placeable-types.ts) its heading names
 * what those types draw rather than announcing a second field.
 */
const GROUP_HEADINGS: Record<EmittedTypeGroup, string> = {
  flowchart: "flowchart:",
  geometric: "geometric:",
  special: "icons — a glyph with the text captioned beneath it:",
};

/**
 * The roster lists exactly what the model may place, so it is filtered through
 * the folded vocabulary rather than read straight off the schema table. Two
 * kinds of name drop out: the `icon` carrier type — glyphs are folded in as
 * types of their own (placeable-types.ts), so there is no name for "an icon
 * without a glyph" to sit under — and any shape type whose name a glyph took in
 * the collision audit, which is read-only and therefore not offered.
 */
function typesInGroup(group: TypeGroup): InteractiveCanvasObjectType[] {
  const placeableShapes = new Set<string>(PLACEABLE_SHAPE_TYPES);
  return (Object.keys(OBJECT_TYPE_DEFAULTS) as InteractiveCanvasObjectType[])
    .filter((type) => TYPE_GROUPS[type] === group && placeableShapes.has(type));
}

/**
 * Field contracts the contact sheet cannot show. The direction subsets
 * mirror the validator's acceptance (left|right for the horizontal pointers,
 * up|down for triangle).
 */
const FUNCTIONAL_NOTES: Partial<Record<InteractiveCanvasObjectType, string>> = {
  "arrow-shape": "points left or right via `direction`",
  chevron: "points left or right via `direction`",
  parallelogram: "leans left or right via `direction`",
  triangle: "points up or down via `direction`",
};

/** One roster line: the type name and any field contract — geometry is the agent's to choose. */
function typeEntry(type: InteractiveCanvasObjectType): string {
  const note = FUNCTIONAL_NOTES[type];
  return note === undefined ? type : `${type} — ${note}`;
}

/**
 * A folded glyph type, plus its human label only when it says more than the
 * name does. The name is the type the model places — the glyph id it lowers
 * to is this module's business, not the model's.
 */
function glyphEntry(placeableType: PlaceableGlyphType): string {
  const glyph = glyphForPlaceableType(placeableType);
  if (glyph === undefined) return placeableType;
  const label = ICON_GLYPHS[glyph].label;
  return label.toLowerCase() === placeableType ? placeableType : `${placeableType} (${label})`;
}

// ---------------------------------------------------------------------------
// Generated section fragments
// ---------------------------------------------------------------------------

/** Flush-left <vocabulary> body; the assembly wraps and indents it. */
export function buildObjectsGenerated(): string {
  const lines: string[] = ["types, one per line:"];
  for (const group of EMITTED_GROUP_ORDER) {
    lines.push(`    ${GROUP_HEADINGS[group]}`);
    for (const type of typesInGroup(group)) {
      lines.push(`        ${typeEntry(type)}`);
    }
    if (group === "special") {
      for (const placeableType of PLACEABLE_GLYPH_TYPES) {
        lines.push(`        ${glyphEntry(placeableType)}`);
      }
    }
  }
  lines.push("colors (objects and connections), one per line:");
  for (const color of CANVAS_COLORS) {
    lines.push(`    ${color}`);
  }
  lines.push("these rosters are closed — draw every type and color from them");
  return lines.join("\n");
}

/** Flush-left <fields> body; the assembly wraps and indents it. */
export function buildConnectionFieldsGenerated(): string {
  return [
    `endpoint anchor: ${[...ANCHOR_SIDES, "center"].join(" | ")} — pins the side the wire uses; omit for automatic`,
    "endpoint position: [x,y] fractions 0..1 of the box, a finer pin than anchor",
    `arrow: ${ARROW_KINDS.join(" | ")} (default forward)`,
    `style: ${STYLE_KINDS.join(" | ")} (default solid)`,
    "waypoints: [x,y] world points the route must pass through",
  ].join("\n");
}

/** The full generated-module source, byte-stable across runs. */
export function renderVocabularyModule(): string {
  const objectLines = buildObjectsGenerated().split("\n");
  const connectionLines = buildConnectionFieldsGenerated().split("\n");
  return [
    "/**",
    " * GENERATED by scripts/generate-capabilities.ts — do not edit by hand.",
    " *",
    " * Schema-derived fragments for the OBJECTS and CONNECTIONS sections of",
    " * the <capabilities> context block: the folded type roster — shapes with",
    " * the icon glyphs folded in as types of their own (the boot-time contact",
    " * sheet carries the looks — geometry is the agent's to choose) — the",
    " * closed color roster, and the connection field enums. The fragments use",
    " * the same schema tables the operation schemas declare.",
    " * Regenerate: bun scripts/generate-capabilities.ts",
    " */",
    "",
    "export const CAPABILITIES_OBJECTS_GENERATED: string = [",
    ...objectLines.map((line) => `  ${JSON.stringify(line)},`),
    '].join("\\n");',
    "",
    "export const CAPABILITIES_CONNECTION_FIELDS_GENERATED: string = [",
    ...connectionLines.map((line) => `  ${JSON.stringify(line)},`),
    '].join("\\n");',
    "",
  ].join("\n");
}

const OUTPUT_FILE = join(
  resolve(import.meta.dir, ".."),
  "src", "catalog", "layout-editor", "context", "capabilities",
  "vocabulary.generated.ts",
);

if (import.meta.main) {
  writeFileSync(OUTPUT_FILE, renderVocabularyModule(), "utf8");
  console.log(`wrote ${OUTPUT_FILE}`);
}
