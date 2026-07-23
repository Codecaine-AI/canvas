/**
 * Docs board sidecar generator.
 *
 * Finds every `*.dsl` layout program under docs/30-agent-layout/, runs it
 * through the real v3 sketch pipeline (parse -> expand -> corridor routing),
 * and writes a sibling `<name>.canvas.json` containing a schema-valid
 * InteractiveCanvasDocument.
 *
 * The .dsl sources live under `<bundle>/assets/canvases/` because that is the
 * only path shape the docs-server will serve a sidecar from
 * (isAllowedCanvasSidecarPath in tools/docs-framework/packages/docs-server/
 * src/confine.ts requires an `assets/canvases/` segment). Doc authors embed a
 * board with `{"flavour": "canvas", "props": {"src":
 * "./assets/canvases/<name>.canvas.json", "title": "..."}}`.
 *
 * Dual-schema emission: the docs embed host renders through the vendored fork
 * at tools/docs-framework/external/canvas, whose validator still requires the
 * legacy `label` on every object and `title` + `tint` on sections, while the
 * live schema requires the unified `text` field. Both validators ignore the
 * other's extra keys, so every object carries text AND label (sections also
 * title + tint) and the document passes both. Drop the legacy fields once the
 * fork is refreshed to the current schema.
 *
 * Hard gates (any failure exits non-zero and skips the write):
 *  - the program must parse (parseSketch) and expand (expandSketch);
 *  - corridor routing must produce zero path-through-box violations;
 *  - the emitted document must pass the LIVE validateInteractiveCanvasDocument
 *    (@codecaine-ai/canvas/schema) AND the vendored fork's validator (what the
 *    docs embed actually runs before mounting its viewer).
 *
 * The output is deterministic — stable ids, sorted traversal, pretty JSON
 * with a trailing newline — so regeneration diffs cleanly.
 *
 * Boards carry no waypoints and no parentId: connector routing and section
 * membership are both engine-owned at render time (membership is geometric).
 *
 * Run: bun packages/canvas-agent/scripts/generate-docs-boards.ts
 *  (or: bun run --cwd packages/canvas-agent generate:docs-boards)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, relative, basename, dirname } from "node:path";

import {
  validateInteractiveCanvasDocument,
  type InteractiveCanvasConnection,
  type InteractiveCanvasDocument,
  type InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

// The stale vendored fork the docs embed host validates/renders with. Same
// exported symbol name, structurally different (legacy label/title/tint)
// schema — imported by path on purpose.
import { validateInteractiveCanvasDocument as validateForkDocument } from "../../../tools/docs-framework/external/canvas/packages/canvas/src/schema";

import { expandSketch } from "../src/pipeline/expand";
import { routeSketchEdges, countPathBoxViolations } from "../src/pipeline/route";
import { parseSketch } from "../src/pipeline/serialize";
import type { ExpandedSketch } from "../src/pipeline/types";

const DOCS_ROOT = join(import.meta.dir, "../../../docs/30-agent-layout");
const MAX_CANVAS_ID_LENGTH = 97;

/**
 * Expansion canvas per board, mirroring the sizes the guide renders at
 * (examples.ts): worked-example steps and the two large language exemplars
 * solve at 1024x576; the small per-statement language examples at 512x336.
 */
const WORKED_SIZE = { width: 1024, height: 576 };
const LANGUAGE_SIZE = { width: 512, height: 336 };
const SIZE_RULES: ReadonlyArray<[RegExp, { width: number; height: number }]> = [
  [/(^|\/)30-worked-example\//, WORKED_SIZE],
  [/example-(main|nesting)\.dsl$/, WORKED_SIZE],
];

function expandSizeFor(relPath: string): { width: number; height: number } {
  for (const [pattern, size] of SIZE_RULES) {
    if (pattern.test(relPath)) return size;
  }
  return LANGUAGE_SIZE;
}

/** Canvas ids allow [A-Za-z0-9_.:-]; DSL ids may carry '#' from uniquification. */
function idBase(source: string, fallback: string): string {
  let base = (source.trim() || fallback)
    .replace(/[^A-Za-z0-9_.:-]+/g, "-")
    .slice(0, MAX_CANVAS_ID_LENGTH);
  if (!/^[A-Za-z0-9]/.test(base)) base = `id-${base}`;
  if (!base) base = fallback;
  return base.slice(0, MAX_CANVAS_ID_LENGTH);
}

function uniqueId(source: string, fallback: string, used: Set<string>): string {
  const base = idBase(source, fallback);
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    const tail = `-${suffix}`;
    candidate = `${base.slice(0, MAX_CANVAS_ID_LENGTH - tail.length)}${tail}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

/** Round to 2 decimals so solver float noise never reaches the diff. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Drop the served-path plumbing segment from naming inputs. */
function logicalRelPath(relPath: string): string {
  return relPath.replace(/(^|\/)assets\/canvases\//, "$1");
}

function documentIdFor(relPath: string): string {
  const slug = logicalRelPath(relPath)
    .replace(/\.dsl$/, "")
    .replace(/[\\/]+/g, "-")
    .replace(/[^A-Za-z0-9_.:-]+/g, "-");
  return idBase(`agent-layout-${slug}`, "agent-layout-board");
}

function titleFor(relPath: string): string {
  const logical = logicalRelPath(relPath);
  const base = basename(logical, ".dsl").replace(/-/g, " ");
  const bundle = basename(dirname(logical))
    .replace(/^\d+-/, "")
    .replace(/-/g, " ");
  const humanized = base.charAt(0).toUpperCase() + base.slice(1);
  return bundle ? `${humanized} (${bundle})` : humanized;
}

function buildDocument(
  expanded: ExpandedSketch,
  relPath: string,
): InteractiveCanvasDocument {
  const used = new Set<string>();
  const canvasIdBySketchId = new Map<string, string>();

  const objects: InteractiveCanvasObject[] = expanded.objects.map(
    (object, index) => {
      const id = uniqueId(object.id, `object-${index + 1}`, used);
      if (!canvasIdBySketchId.has(object.id)) {
        canvasIdBySketchId.set(object.id, id);
      }
      // No parentId: canvas section membership is geometric/engine-owned.
      const text = object.label ?? object.id;
      const isSection = object.type === "section";
      return {
        id,
        type: object.type,
        text,
        // Legacy fields for the vendored docs-embed fork (see file header).
        label: text,
        ...(isSection ? { title: text, tint: "gray" } : {}),
        geometry: {
          x: round2(object.geometry.x),
          y: round2(object.geometry.y),
          width: round2(object.geometry.width),
          height: round2(object.geometry.height),
        },
      } as InteractiveCanvasObject;
    },
  );

  const connections: InteractiveCanvasConnection[] = expanded.edges.map(
    (edge, index) => {
      const from = canvasIdBySketchId.get(edge.from);
      const to = canvasIdBySketchId.get(edge.to);
      if (!from || !to) {
        throw new Error(
          `edge ${edge.from} > ${edge.to}: endpoint missing from expanded objects`,
        );
      }
      // No waypoints: the live viewer routes connectors itself.
      return {
        id: uniqueId(`conn-${index + 1}-${edge.from}-${edge.to}`, `conn-${index + 1}`, used),
        from: { objectId: from },
        to: { objectId: to },
        style: "solid" as const,
        arrow: "forward" as const,
      };
    },
  );

  // Size = expansion bounds unioned with anything the solver pushed outside
  // (fans and grown sections may exceed the requested canvas).
  let right = expanded.bounds.x + expanded.bounds.width;
  let bottom = expanded.bounds.y + expanded.bounds.height;
  for (const object of objects) {
    right = Math.max(right, object.geometry.x + object.geometry.width);
    bottom = Math.max(bottom, object.geometry.y + object.geometry.height);
  }

  return {
    schemaVersion: 1,
    id: documentIdFor(relPath),
    title: titleFor(relPath),
    mode: "diagram",
    size: { width: Math.ceil(right), height: Math.ceil(bottom) },
    objects,
    connections,
  };
}

const dslFiles = [...new Bun.Glob("**/*.dsl").scanSync({ cwd: DOCS_ROOT })]
  .sort()
  .map((file) => join(DOCS_ROOT, file));

if (dslFiles.length === 0) {
  console.error(`No .dsl files found under ${DOCS_ROOT}`);
  process.exit(1);
}

let failures = 0;

for (const file of dslFiles) {
  const relPath = relative(DOCS_ROOT, file);
  const outPath = file.replace(/\.dsl$/, ".canvas.json");
  try {
    const source = readFileSync(file, "utf8");
    const sketch = parseSketch(source);
    const expanded = expandSketch(sketch, {
      ...expandSizeFor(relPath),
      mode: "fit",
    });
    const routed = routeSketchEdges(expanded, "corridors");
    const violations = countPathBoxViolations(routed, expanded.objects);
    if (violations > 0) {
      throw new Error(`${violations} routed path(s) cut through object boxes`);
    }

    const document = buildDocument(expanded, relPath);
    for (const [name, validate] of [
      ["live schema", validateInteractiveCanvasDocument],
      ["docs-embed fork schema", validateForkDocument],
    ] as const) {
      const validation = validate(document);
      if (!validation.ok) {
        const details = validation.issues
          .map((issue) => `  ${issue.path}: ${issue.message}`)
          .join("\n");
        throw new Error(`${name} validation failed:\n${details}`);
      }
      for (const warning of validation.warnings ?? []) {
        console.warn(`WARN  ${relPath}  [${name}] ${warning.path}: ${warning.message}`);
      }
    }

    writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`);
    console.log(
      `OK    ${relPath.padEnd(40)} ${String(document.objects.length).padStart(2)} objects, `
      + `${String(document.connections.length).padStart(2)} connections, `
      + `${routed.length} routed edges, 0 violations`,
    );
  } catch (error) {
    failures += 1;
    console.error(`FAIL  ${relPath}\n      ${String(error).replace(/\n/g, "\n      ")}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} board(s) FAILED — nothing written for those files.`);
  process.exit(1);
}
console.log(`\nAll ${dslFiles.length} board(s) generated.`);
