/**
 * zz-dom-fixtures — UNCOMMITTED DOM-equivalence gate for the registry
 * refactor (RESTRUCTURE.md step 4/5). Builds the render corpus (all repo
 * fixture canvases + 4 synthetic docs), renders it through CanvasStage under
 * three prop profiles, and structurally compares captures.
 *
 * Everything here is deterministic: no Date.now, no randomness, fixture
 * files are loaded in sorted order.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CanvasStage, type CanvasStageProps } from "./render/CanvasStage";
import { defaultGeometryFor, shapeForType } from "./state/schema/object-defaults";
import {
  validateInteractiveCanvasDocument,
  type CanvasObjectStyle,
  type InteractiveCanvasConnection,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
  type InteractiveCanvasObjectType,
} from "./state/schema";

// ---------------------------------------------------------------------------
// Type / shape enumerations (compile-time checked against the schema unions)
// ---------------------------------------------------------------------------

export const ALL_OBJECT_TYPES = [
  "rectangle",
  "process",
  "decision",
  "sticky",
  "annotation-marker",
  "document",
  "database",
  "section",
  "pill",
  "arrow-shape",
  "predefined-process",
  "ellipse",
  "triangle",
  "parallelogram",
  "pentagon",
  "octagon",
  "star",
  "plus",
  "chevron",
  "folder",
  "document-stack",
  "off-page-connector",
  "trapezoid",
  "manual-input",
  "hexagon",
  "internal-storage",
  "or-junction",
  "summing-junction",
  "cylinder-horizontal",
  "page-corner",
  "icon",
] as const satisfies readonly InteractiveCanvasObjectType[];

type ShapeName = NonNullable<CanvasObjectStyle["shape"]>;

export const ALL_SHAPES = [
  "rounded-rect",
  "diamond",
  "pill",
  "note",
  "marker",
  "document",
  "database",
  "section",
  "arrow-shape",
  "predefined-process",
  "ellipse",
  "triangle",
  "parallelogram",
  "pentagon",
  "octagon",
  "star",
  "plus",
  "chevron",
  "folder",
  "document-stack",
  "off-page-connector",
  "trapezoid",
  "manual-input",
  "hexagon",
  "internal-storage",
  "or-junction",
  "summing-junction",
  "cylinder-horizontal",
  "page-corner",
  "icon",
] as const satisfies readonly ShapeName[];

// Compile-time exhaustiveness: these aliases error if the schema unions grow
// a member that isn't enumerated above.
type AssertNever<T extends never> = T;
type _MissingObjectType = AssertNever<
  Exclude<InteractiveCanvasObjectType, (typeof ALL_OBJECT_TYPES)[number]>
>;
type _MissingShape = AssertNever<Exclude<ShapeName, (typeof ALL_SHAPES)[number]>>;

// ---------------------------------------------------------------------------
// Fixture loading (repo-root canvases/*.canvas.json)
// ---------------------------------------------------------------------------

export type FixtureLoadFailure = { file: string; message: string };

export type CorpusEntry = {
  name: string;
  document: InteractiveCanvasDocument;
  adversarial: boolean;
};

export type Corpus = {
  entries: CorpusEntry[];
  failures: FixtureLoadFailure[];
};

/** Names of synthetic docs whose diffs are adjudicated manually, not auto-failed. */
export const ADVERSARIAL_DOC_NAMES: ReadonlySet<string> = new Set(["zz-d-adversarial"]);

function defaultCanvasesDir(): string {
  // src/zz-dom-fixtures.ts -> packages/canvas/src -> repo root /canvases
  return fileURLToPath(new URL("../../../canvases", import.meta.url));
}

export function loadFixtureDocuments(canvasesDir?: string): {
  entries: CorpusEntry[];
  failures: FixtureLoadFailure[];
} {
  const dir = canvasesDir ?? process.env.ZZ_CANVASES_DIR ?? defaultCanvasesDir();
  const entries: CorpusEntry[] = [];
  const failures: FixtureLoadFailure[] = [];
  const files = readdirSync(dir)
    .filter((file) => file.endsWith(".canvas.json"))
    .sort();
  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch (error) {
      failures.push({ file, message: `JSON parse error: ${String(error)}` });
      continue;
    }
    const result = validateInteractiveCanvasDocument(raw);
    if (!result.ok) {
      failures.push({
        file,
        message: `validation failed: ${result.issues.map((i) => `${i.path}: ${i.message}`).join("; ")}`,
      });
      continue;
    }
    entries.push({
      name: `fixture:${file.replace(/\.canvas\.json$/, "")}`,
      document: result.document,
      adversarial: false,
    });
  }
  return { entries, failures };
}

// ---------------------------------------------------------------------------
// Synthetic doc A — "all-types": one object per InteractiveCanvasObjectType
// ---------------------------------------------------------------------------

function buildAllTypesDoc(): InteractiveCanvasDocument {
  const GRID_COLS = 6;
  const CELL_W = 700;
  const CELL_H = 600;
  const objects: InteractiveCanvasObject[] = ALL_OBJECT_TYPES.map((type, index) => {
    const base = defaultGeometryFor(type);
    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
    const object: InteractiveCanvasObject = {
      id: `a-${type}`,
      type,
      text: `Label ${type}`,
      parentId: null,
      geometry: {
        x: base.x + col * CELL_W,
        y: base.y + row * CELL_H,
        width: base.width,
        height: base.height,
      },
      style: { shape: shapeForType(type) },
    };
    if (index % 2 === 1) object.text = `${object.text}\nBody ${type}`;
    if (type === "section") {
      object.text = "Title section";
      object.color = "blue";
    }
    if (type === "icon") object.icon = "gear";
    if (type === "sticky") object.author = "zz";
    return object;
  });
  const connections: InteractiveCanvasConnection[] = [
    {
      id: "conn-a-0",
      from: { objectId: "a-rectangle", anchor: "right" },
      to: { objectId: "a-process", anchor: "left" },
      label: "A link",
      style: "solid",
      arrow: "forward",
    },
    {
      id: "conn-a-1",
      from: { objectId: "a-decision", anchor: "bottom" },
      to: { objectId: "a-sticky", anchor: "top" },
      style: "solid",
      arrow: "both",
      color: "gray",
    },
  ];
  return {
    schemaVersion: 1,
    id: "zz-a-all-types",
    title: "zz all types",
    mode: "diagram",
    objects,
    connections,
  };
}

// ---------------------------------------------------------------------------
// Synthetic doc B — "all-shapes": process-typed objects, one per style.shape,
// plus direction / height / explicit-style variants.
// ---------------------------------------------------------------------------

function buildAllShapesDoc(): InteractiveCanvasDocument {
  const GRID_COLS = 8;
  const CELL_W = 300;
  const CELL_H = 240;
  type Variant = {
    slug: string;
    shape: ShapeName;
    direction?: InteractiveCanvasObject["direction"];
    height?: number;
    extraText?: string;
    color?: InteractiveCanvasObject["color"];
    style?: Omit<CanvasObjectStyle, "shape">;
    icon?: InteractiveCanvasObject["icon"];
  };
  const variants: Variant[] = [];
  for (const shape of ALL_SHAPES) {
    variants.push({ slug: `base-${shape}`, shape });
  }
  for (const shape of ["arrow-shape", "chevron", "parallelogram"] as const) {
    variants.push({ slug: `dir-left-${shape}`, shape, direction: "left" });
    variants.push({ slug: `dir-right-${shape}`, shape, direction: "right" });
  }
  variants.push({ slug: "dir-up-triangle", shape: "triangle", direction: "up" });
  variants.push({ slug: "dir-down-triangle", shape: "triangle", direction: "down" });
  variants.push({ slug: "icon-chat-h80", shape: "icon", height: 80, extraText: "Body icon chat h80", icon: "chat" });
  variants.push({ slug: "icon-chat-h120", shape: "icon", height: 120, extraText: "Body icon chat h120", icon: "chat" });
  variants.push({ slug: "icon-person-h80", shape: "icon", height: 80, extraText: "Body icon person h80", icon: "person" });
  for (const shape of ["document", "database", "icon", "arrow-shape"] as const) {
    // P1 — color-pick coverage per silhouette family: a soft pick with a
    // strokeWidth override, a borderless bold pick, and a second soft hue.
    variants.push({
      slug: `styled-soft-${shape}`,
      shape,
      color: "yellow",
      style: { strokeWidth: 6 },
    });
    variants.push({ slug: `styled-bold-${shape}`, shape, color: "violet" });
    variants.push({ slug: `styled-soft2-${shape}`, shape, color: "orange" });
  }
  const objects: InteractiveCanvasObject[] = variants.map((variant, index) => {
    const col = index % GRID_COLS;
    const row = Math.floor(index / GRID_COLS);
      const object: InteractiveCanvasObject = {
      id: `b-${index}-${variant.slug}`,
      type: "process",
      text: `Label ${variant.slug}`,
      parentId: null,
      geometry: {
        x: 40 + col * CELL_W,
        y: 40 + row * CELL_H,
        width: 220,
        height: variant.height ?? 140,
      },
      style: { shape: variant.shape, ...(variant.style ?? {}) },
    };
    if (variant.color) object.color = variant.color;
    if (variant.direction) object.direction = variant.direction;
    if (variant.shape === "icon") object.icon = variant.icon ?? "gear";
    if (variant.extraText) object.text = `${object.text}\n${variant.extraText}`;
    return object;
  });
  const connections: InteractiveCanvasConnection[] = [
    {
      id: "conn-b-0",
      from: { objectId: objects[0]!.id, anchor: "right" },
      to: { objectId: objects[1]!.id, anchor: "left" },
      style: "solid",
      arrow: "forward",
    },
  ];
  return {
    schemaVersion: 1,
    id: "zz-b-all-shapes",
    title: "zz all shapes",
    mode: "diagram",
    objects,
    connections,
  };
}

// ---------------------------------------------------------------------------
// Synthetic doc C — "specials": sections (incl. nesting),
// section parentId membership, sticky.
// ---------------------------------------------------------------------------

function buildSpecialsDoc(): InteractiveCanvasDocument {
  const objects: InteractiveCanvasObject[] = [
    {
      id: "c-section-one",
      type: "section",
      text: "Section One",
      parentId: null,
      geometry: { x: 40, y: 40, width: 520, height: 400 },
      style: { shape: "section" },
      color: "green",
    },
    {
      id: "c-section-nested",
      type: "section",
      text: "Nested Section",
      parentId: null,
      geometry: { x: 80, y: 100, width: 240, height: 180 },
      style: { shape: "section" },
      color: "yellow",
    },
    {
      id: "c-section-hidden",
      type: "section",
      text: "Hidden Section",
      parentId: null,
      geometry: { x: 700, y: 40, width: 480, height: 360 },
      style: { shape: "section" },
      color: "violet",
    },
    // Objects >=60% inside the third section.
    {
      id: "c-hidden-a",
      type: "process",
      text: "Label hidden a",
      parentId: null,
      geometry: { x: 740, y: 100, width: 160, height: 90 },
      style: { shape: "rounded-rect" },
    },
    {
      id: "c-hidden-b",
      type: "decision",
      text: "Label hidden b\nBody hidden b",
      parentId: null,
      geometry: { x: 940, y: 240, width: 160, height: 112 },
      style: { shape: "diamond" },
    },
    // Plain rectangle (replaces the legacy container; no children).
    {
      id: "c-rectangle",
      type: "rectangle",
      text: "Label rectangle",
      parentId: null,
      geometry: { x: 40, y: 520, width: 360, height: 240 },
    },
    // Persisted section membership: two objects parented into section one.
    {
      id: "c-child-one",
      type: "process",
      text: "Label child one",
      parentId: "c-section-one",
      geometry: { x: 80, y: 560, width: 140, height: 80 },
      style: { shape: "rounded-rect" },
    },
    {
      id: "c-child-two",
      type: "process",
      text: "Label child two\nBody child two",
      parentId: "c-section-one",
      geometry: { x: 220, y: 660, width: 140, height: 80 },
      style: { shape: "rounded-rect" },
    },
    // Sticky with text + author.
    {
      id: "c-sticky",
      type: "sticky",
      text: "Body sticky",
      parentId: null,
      geometry: { x: 360, y: 120, width: 176, height: 128 },
      style: { shape: "note" },
      author: "zz",
    },
  ];
  const connections: InteractiveCanvasConnection[] = [
    {
      id: "conn-c-0",
      from: { objectId: "c-sticky", anchor: "right" },
      to: { objectId: "c-child-two", anchor: "top" },
      label: "C link",
      style: "solid",
      arrow: "forward",
    },
  ];
  return {
    schemaVersion: 1,
    id: "zz-c-specials",
    title: "zz specials",
    mode: "diagram",
    objects,
    connections,
  };
}

// ---------------------------------------------------------------------------
// Synthetic doc D — "adversarial": type/shape mismatches that probe the
// dispatch-order semantics of the registry (adjudicated manually).
// ---------------------------------------------------------------------------

function buildAdversarialDoc(): InteractiveCanvasDocument {
  const objects: InteractiveCanvasObject[] = [
    {
      id: "d-rectangle-diamond",
      type: "rectangle",
      text: "Label rectangle diamond",
      parentId: null,
      geometry: { x: 80, y: 80, width: 360, height: 240 },
      style: { shape: "diamond" },
    },
  ];
  return {
    schemaVersion: 1,
    id: "zz-d-adversarial",
    title: "zz adversarial",
    mode: "diagram",
    objects,
    connections: [],
  };
}

export function buildCorpus(canvasesDir?: string): Corpus {
  const { entries, failures } = loadFixtureDocuments(canvasesDir);
  return {
    entries: [
      ...entries,
      { name: "zz-a-all-types", document: buildAllTypesDoc(), adversarial: false },
      { name: "zz-b-all-shapes", document: buildAllShapesDoc(), adversarial: false },
      { name: "zz-c-specials", document: buildSpecialsDoc(), adversarial: false },
      { name: "zz-d-adversarial", document: buildAdversarialDoc(), adversarial: true },
    ],
    failures,
  };
}

// ---------------------------------------------------------------------------
// Rendering profiles
// ---------------------------------------------------------------------------

export const PROFILE_NAMES = ["viewer", "editor", "compact"] as const;
export type ProfileName = (typeof PROFILE_NAMES)[number];

/** { [docName]: { [profile]: html } } */
export type Capture = Record<string, Record<string, string>>;

function stageProps(document: InteractiveCanvasDocument, profile: ProfileName): CanvasStageProps {
  if (profile === "viewer") {
    return { document, viewport: { x: 0, y: 0, zoom: 1 } };
  }
  if (profile === "compact") {
    return { document, viewport: { x: 0, y: 0, zoom: 2 }, compact: true };
  }
  // editor
  const ids = document.objects.map((object) => object.id);
  const selectedObjectIds = [ids[0], ids[3]].filter((id): id is string => id !== undefined);
  const changedObjectIds = ids[1] !== undefined ? [ids[1]] : [];
  return {
    document,
    viewport: { x: 12.5, y: -40, zoom: 0.8 },
    selectedObjectIds,
    changedObjectIds,
    selectedConnectionId: document.connections[0]?.id ?? null,
    editingTextObjectId: ids[2] ?? null,
    interactionOverlay: { dropTargetId: ids[4] ?? null },
    activeTool: "select",
    onObjectSelect: (_objectId: string) => {},
    onStagePointerEvent: (_event: ReactPointerEvent<HTMLElement>) => {},
    onObjectContextMenu: (
      _event: ReactMouseEvent<HTMLElement>,
      _object: InteractiveCanvasObject,
    ) => {},
    onConnectionDoubleClick: (_connectionId: string) => {},
  };
}

export function renderProfileHtml(
  document: InteractiveCanvasDocument,
  profile: ProfileName,
): string {
  return renderToStaticMarkup(createElement(CanvasStage, stageProps(document, profile)));
}

export function captureCorpus(corpus: Corpus): Capture {
  const capture: Capture = {};
  for (const entry of corpus.entries) {
    const perProfile: Record<string, string> = {};
    for (const profile of PROFILE_NAMES) {
      perProfile[profile] = renderProfileHtml(entry.document, profile);
    }
    capture[entry.name] = perProfile;
  }
  return capture;
}

// ---------------------------------------------------------------------------
// Comparator
// ---------------------------------------------------------------------------

export type CompareResult = {
  equal: boolean;
  /** Hard mismatches (byte diff outside <style>, selector add/remove, per-selector decl sequence). */
  failures: string[];
  /** Cross-selector reorderings — cascade-relevant only across selectors, needs manual audit. */
  warnings: string[];
};

function splitOnStyle(html: string, context: string, failures: string[]):
  | { outside: string; css: string }
  | null {
  const openMatches = html.match(/<style>/g) ?? [];
  const closeMatches = html.match(/<\/style>/g) ?? [];
  if (openMatches.length !== 1 || closeMatches.length !== 1) {
    failures.push(
      `${context}: expected exactly one <style>...</style> block, found ${openMatches.length} open / ${closeMatches.length} close`,
    );
    return null;
  }
  const open = html.indexOf("<style>");
  const close = html.indexOf("</style>");
  if (close < open) {
    failures.push(`${context}: malformed <style> block (close before open)`);
    return null;
  }
  const cssStart = open + "<style>".length;
  return {
    // Outside parts, tags included; joined with a sentinel so a length change
    // on one side of the style tag can't silently compensate the other.
    outside: html.slice(0, cssStart) + " " + html.slice(close),
    css: html.slice(cssStart, close),
  };
}

function windowedDiff(a: string, b: string): string {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i += 1;
  const start = Math.max(0, i - 120);
  const show = (s: string) => JSON.stringify(s.slice(start, i + 120));
  return `first divergence at index ${i} (lenA=${a.length}, lenB=${b.length})\n    A: ${show(a)}\n    B: ${show(b)}`;
}

type CssRule = { selector: string; decls: string };

function normalizeDeclBlock(block: string): string {
  return block
    .split(";")
    .map((decl) => decl.replace(/\s+/g, " ").replace(/\s*:\s*/, ": ").trim())
    .filter((decl) => decl.length > 0)
    .join("; ");
}

/**
 * Parses flat CSS (no nested/at-rules expected in the stage's style block)
 * into single-selector rules: comments stripped, comma groups expanded,
 * whitespace normalized.
 */
export function parseCssRules(css: string, context: string, failures: string[]): CssRule[] {
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const rules: CssRule[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let consumedUpTo = 0;
  let leftover = "";
  let match: RegExpExecArray | null;
  while ((match = re.exec(noComments)) !== null) {
    leftover += noComments.slice(consumedUpTo, match.index);
    consumedUpTo = re.lastIndex;
    const selectorGroup = match[1] ?? "";
    const declBlock = normalizeDeclBlock(match[2] ?? "");
    for (const rawSelector of selectorGroup.split(",")) {
      const selector = rawSelector.replace(/\s+/g, " ").trim();
      if (!selector) continue;
      rules.push({ selector, decls: declBlock });
    }
  }
  leftover += noComments.slice(consumedUpTo);
  if (leftover.trim().length > 0) {
    failures.push(
      `${context}: CSS parser leftover (nested/at-rule content?): ${JSON.stringify(leftover.trim().slice(0, 200))}`,
    );
  }
  return rules;
}

function compareCss(cssA: string, cssB: string, context: string, result: CompareResult): void {
  const rulesA = parseCssRules(cssA, `${context} [A]`, result.failures);
  const rulesB = parseCssRules(cssB, `${context} [B]`, result.failures);

  const bySelector = (rules: CssRule[]): Map<string, string[]> => {
    const map = new Map<string, string[]>();
    for (const rule of rules) {
      const list = map.get(rule.selector);
      if (list) list.push(rule.decls);
      else map.set(rule.selector, [rule.decls]);
    }
    return map;
  };
  const mapA = bySelector(rulesA);
  const mapB = bySelector(rulesB);

  for (const selector of mapA.keys()) {
    if (!mapB.has(selector)) result.failures.push(`${context}: selector removed in B: ${selector}`);
  }
  for (const selector of mapB.keys()) {
    if (!mapA.has(selector)) result.failures.push(`${context}: selector added in B: ${selector}`);
  }
  for (const [selector, declsA] of mapA) {
    const declsB = mapB.get(selector);
    if (!declsB) continue;
    if (declsA.length !== declsB.length) {
      result.failures.push(
        `${context}: selector "${selector}" occurs ${declsA.length}x in A but ${declsB.length}x in B (per-selector cascade order is load-bearing)`,
      );
      continue;
    }
    for (let i = 0; i < declsA.length; i += 1) {
      if (declsA[i] !== declsB[i]) {
        result.failures.push(
          `${context}: selector "${selector}" occurrence ${i + 1}/${declsA.length} declaration mismatch\n    A: { ${declsA[i]} }\n    B: { ${declsB[i]} }`,
        );
      }
    }
  }

  // Cross-selector ordering: if content matched per selector, a change in the
  // flattened selector-occurrence order is a WARNING (manual cascade audit).
  const orderA = rulesA.map((rule) => rule.selector);
  const orderB = rulesB.map((rule) => rule.selector);
  if (orderA.join(" ") !== orderB.join(" ")) {
    let firstIndex = 0;
    const n = Math.min(orderA.length, orderB.length);
    while (firstIndex < n && orderA[firstIndex] === orderB[firstIndex]) firstIndex += 1;
    result.warnings.push(
      `${context}: cross-selector rule order changed (first at rule ${firstIndex}: A=${JSON.stringify(
        orderA[firstIndex] ?? "<end>",
      )} B=${JSON.stringify(orderB[firstIndex] ?? "<end>")}) — needs manual cascade audit`,
    );
  }
}

export function compareHtml(a: string, b: string, context: string): CompareResult {
  const result: CompareResult = { equal: true, failures: [], warnings: [] };
  const partsA = splitOnStyle(a, `${context} [A]`, result.failures);
  const partsB = splitOnStyle(b, `${context} [B]`, result.failures);
  if (partsA && partsB) {
    if (partsA.outside !== partsB.outside) {
      result.failures.push(`${context}: HTML outside <style> differs — ${windowedDiff(partsA.outside, partsB.outside)}`);
    }
    compareCss(partsA.css, partsB.css, context, result);
  }
  result.equal = result.failures.length === 0;
  return result;
}

export function compareCaptures(a: Capture, b: Capture): CompareResult {
  const result: CompareResult = { equal: true, failures: [], warnings: [] };
  const docNames = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  for (const docName of docNames) {
    const docA = a[docName];
    const docB = b[docName];
    if (!docA || !docB) {
      result.failures.push(`${docName}: present only in ${docA ? "A" : "B"}`);
      continue;
    }
    const profiles = [...new Set([...Object.keys(docA), ...Object.keys(docB)])].sort();
    for (const profile of profiles) {
      const htmlA = docA[profile];
      const htmlB = docB[profile];
      if (htmlA === undefined || htmlB === undefined) {
        result.failures.push(`${docName}/${profile}: present only in ${htmlA !== undefined ? "A" : "B"}`);
        continue;
      }
      if (htmlA === htmlB) continue; // fast path: byte-identical
      const sub = compareHtml(htmlA, htmlB, `${docName}/${profile}`);
      result.failures.push(...sub.failures);
      result.warnings.push(...sub.warnings);
      if (sub.equal && sub.warnings.length === 0) {
        // Not byte-identical yet structurally clean — only possible via
        // comment/whitespace changes inside the style block; surface it.
        result.warnings.push(
          `${docName}/${profile}: style block differs only in comments/whitespace (structurally equivalent)`,
        );
      }
    }
  }
  result.equal = result.failures.length === 0;
  return result;
}

/** Splits a capture-level result by whether each line concerns an adversarial doc. */
export function partitionByAdversarial(lines: string[]): { normal: string[]; adversarial: string[] } {
  const normal: string[] = [];
  const adversarial: string[] = [];
  for (const line of lines) {
    const docName = line.split("/")[0]?.split(":")[0] ?? "";
    (ADVERSARIAL_DOC_NAMES.has(docName) ? adversarial : normal).push(line);
  }
  return { normal, adversarial };
}
