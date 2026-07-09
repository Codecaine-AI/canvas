/**
 * outline-anchor-corpus — deterministic geometry corpus backing the P3
 * byte-identical gate (objects/__tests__/outline-anchor-baseline.test.ts).
 *
 * For every InteractiveCanvasObjectType it records, at full float precision:
 *   - outlinePolygon(object) and getConnectionAnchors(object) across
 *     geometry / style.shape / direction variants — including the dispatch
 *     quirks the P3 refactor must preserve verbatim (type-first dispatch:
 *     `process` + `style.shape: "triangle"` stays a BBOX outline; secondary
 *     style-shape dispatch only for pill/diamond/ellipse);
 *   - resolveConnectionCascade results for a fixed probe grid around a
 *     100×100 object of each type, at zooms 1 and 4.
 *
 * Capture (writes the JSON fixture):
 *   bun packages/canvas/src/objects/__tests__/outline-anchor-corpus.ts \
 *     packages/canvas/src/objects/__tests__/__fixtures__/outline-anchor-baseline.json
 *
 * The fixture is captured BEFORE the P3 refactor and kept as a regression
 * corpus afterwards; the test compares JSON-round-tripped fresh values
 * against it, so any behavioral drift in outline/anchor/cascade geometry is
 * a hard failure.
 */

import { writeFileSync } from "node:fs";
import { shapeForType } from "../../state/schema/object-defaults";
import type { InteractiveCanvasObject, InteractiveCanvasObjectType } from "../../state/schema";
import { ALL_OBJECT_TYPES } from "../../zz-dom-fixtures";
import { getConnectionAnchors, outlinePolygon } from "../geometry";
import { resolveConnectionCascade } from "../../connectors/connection-cascade";

type GeometryVariant = { name: string; x: number; y: number; width: number; height: number };

/** Includes a translated box and two degenerate boxes (fallback-midpoint path). */
const GEOMETRY_VARIANTS: GeometryVariant[] = [
  { name: "100x100", x: 0, y: 0, width: 100, height: 100 },
  { name: "220x140@13,-27", x: 13, y: -27, width: 220, height: 140 },
  { name: "37x61", x: 0, y: 0, width: 37, height: 61 },
  { name: "8x6", x: 0, y: 0, width: 8, height: 6 },
  { name: "0x0", x: 0, y: 0, width: 0, height: 0 },
];

type StyleVariant = { name: string; style: InteractiveCanvasObject["style"] | undefined };

function styleVariantsFor(type: InteractiveCanvasObjectType): StyleVariant[] {
  const variants: StyleVariant[] = [
    { name: `shape=${shapeForType(type)}`, style: { shape: shapeForType(type) } },
    // Locks the type-first dispatch quirk: outline dispatch keys on
    // object.type before style.shape, so an absent style must not change it.
    { name: "no-style", style: undefined },
  ];
  if (type === "process") {
    // Locks the secondary style-shape dispatch quirk: only pill/diamond/
    // ellipse are consulted via style.shape; process+triangle stays BBOX.
    for (const shape of ["triangle", "diamond", "pill", "ellipse"] as const) {
      variants.push({ name: `mismatch-shape=${shape}`, style: { shape } });
    }
  }
  return variants;
}

function directionVariantsFor(
  type: InteractiveCanvasObjectType,
): ReadonlyArray<InteractiveCanvasObject["direction"] | undefined> {
  if (type === "triangle") return ["up", "down", undefined];
  if (type === "arrow-shape" || type === "chevron" || type === "parallelogram") {
    return ["left", "right", undefined];
  }
  return [undefined];
}

/** Fixed probe grid (bbox-midpoint-anchored so it never depends on the code under test). */
function cascadeProbes(): Array<{ label: string; x: number; y: number }> {
  const midpoints = [
    { side: "top", x: 50, y: 0 },
    { side: "right", x: 100, y: 50 },
    { side: "bottom", x: 50, y: 100 },
    { side: "left", x: 0, y: 50 },
  ];
  const offsets = [
    { tag: "+3x", dx: 3, dy: 0 },
    { tag: "-3x", dx: -3, dy: 0 },
    { tag: "+3y", dx: 0, dy: 3 },
    { tag: "-3y", dx: 0, dy: -3 },
    { tag: "+20x", dx: 20, dy: 0 },
    { tag: "-20x", dx: -20, dy: 0 },
    { tag: "+20y", dx: 0, dy: 20 },
    { tag: "-20y", dx: 0, dy: -20 },
  ];
  const probes: Array<{ label: string; x: number; y: number }> = [];
  for (const midpoint of midpoints) {
    for (const offset of offsets) {
      probes.push({
        label: `${midpoint.side}${offset.tag}`,
        x: midpoint.x + offset.dx,
        y: midpoint.y + offset.dy,
      });
    }
  }
  probes.push({ label: "center", x: 50, y: 50 });
  probes.push({ label: "near-top-edge-off-anchor", x: 80, y: 4 });
  probes.push({ label: "far-away", x: 5000, y: 5000 });
  return probes;
}

export type OutlineAnchorBaseline = {
  outlines: Record<string, { polygon: unknown; anchors: unknown }>;
  cascade: Record<string, Record<string, Record<string, unknown>>>;
};

export function buildOutlineAnchorBaseline(): OutlineAnchorBaseline {
  const outlines: OutlineAnchorBaseline["outlines"] = {};
  for (const type of ALL_OBJECT_TYPES) {
    for (const geometry of GEOMETRY_VARIANTS) {
      for (const styleVariant of styleVariantsFor(type)) {
        for (const direction of directionVariantsFor(type)) {
          const object: InteractiveCanvasObject = {
            id: `probe-${type}`,
            type,
            text: type,
            geometry: {
              x: geometry.x,
              y: geometry.y,
              width: geometry.width,
              height: geometry.height,
            },
          };
          if (styleVariant.style) object.style = styleVariant.style;
          if (direction) object.direction = direction;
          const key = `${type}|${geometry.name}|${styleVariant.name}|dir=${direction ?? "none"}`;
          outlines[key] = {
            polygon: outlinePolygon(object),
            anchors: getConnectionAnchors(object),
          };
        }
      }
    }
  }

  const probes = cascadeProbes();
  const cascade: OutlineAnchorBaseline["cascade"] = {};
  for (const type of ALL_OBJECT_TYPES) {
    const object: InteractiveCanvasObject = {
      id: `cascade-${type}`,
      type,
      text: type,
      geometry: { x: 0, y: 0, width: 100, height: 100 },
      style: { shape: shapeForType(type) },
    };
    const perZoom: Record<string, Record<string, unknown>> = {};
    for (const zoom of [1, 4]) {
      const results: Record<string, unknown> = {};
      for (const probe of probes) {
        results[probe.label] = resolveConnectionCascade(
          { x: probe.x, y: probe.y },
          [object],
          zoom,
        );
      }
      perZoom[`zoom${zoom}`] = results;
    }
    cascade[type] = perZoom;
  }

  return { outlines, cascade };
}

if (import.meta.main) {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error(
      "Usage: bun packages/canvas/src/objects/__tests__/outline-anchor-corpus.ts <out.json>",
    );
    process.exit(2);
  }
  const baseline = buildOutlineAnchorBaseline();
  writeFileSync(outPath, JSON.stringify(baseline, null, 1));
  console.log(
    `Captured ${Object.keys(baseline.outlines).length} outline/anchor entries and ${
      Object.keys(baseline.cascade).length
    } cascade tables -> ${outPath}`,
  );
}
