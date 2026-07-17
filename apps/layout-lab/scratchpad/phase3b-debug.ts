/** Per-board mismatch analysis: which pairs lose relation/adjacency. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { expandSketch } from "../src/sketch/expand";
import { fitSketch } from "../src/sketch/fit";
import { parseSketch, serializeSketch } from "../src/sketch/serialize";

const board = process.argv[2] ?? "gc-decomp-harness";
const mode = process.argv[3] ?? "relation";
const CANVAS_DIR = join(import.meta.dir, "../../../canvases");
const document = JSON.parse(
  readFileSync(join(CANVAS_DIR, `${board}.canvas.json`), "utf8"),
) as InteractiveCanvasDocument;

function contentBounds(objects: { geometry: { x: number; y: number; width: number; height: number } }[]) {
  const left = Math.min(...objects.map(({ geometry }) => geometry.x));
  const top = Math.min(...objects.map(({ geometry }) => geometry.y));
  const right = Math.max(...objects.map(({ geometry }) => geometry.x + geometry.width));
  const bottom = Math.max(...objects.map(({ geometry }) => geometry.y + geometry.height));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

const sketch = fitSketch(document);
const text = serializeSketch(sketch);
const parsed = parseSketch(text);
const bounds = contentBounds(document.objects);
const reconstruction = expandSketch(parsed, {
  width: Math.max(720, Math.round(bounds.width)),
  height: Math.max(480, Math.round(bounds.height)),
});

type Rect = { x: number; y: number; width: number; height: number };
type Obj = { id: string; type: string; geometry: Rect };
const rById = new Map(reconstruction.objects.map((o) => [o.id, o]));

const cx = (r: Rect) => r.x + r.width / 2;
const cy = (r: Rect) => r.y + r.height / 2;
const area = (r: Rect) => Math.max(0, r.width) * Math.max(0, r.height);
const contained = (a: Obj, b: Obj) => b.type === "section" && area(a.geometry) < area(b.geometry)
  && cx(a.geometry) >= b.geometry.x && cx(a.geometry) <= b.geometry.x + b.geometry.width
  && cy(a.geometry) >= b.geometry.y && cy(a.geometry) <= b.geometry.y + b.geometry.height;
const sig = (a: Obj, b: Obj) => ({
  leftOf: a.geometry.x + a.geometry.width <= b.geometry.x,
  above: a.geometry.y + a.geometry.height <= b.geometry.y,
  containedIn: contained(a, b),
});

if (mode === "relation") {
  const counts = new Map<string, number>();
  const kinds = new Map<string, number>();
  for (const a of document.objects) {
    for (const b of document.objects) {
      if (a.id === b.id) continue;
      const ra = rById.get(a.id)!;
      const rb = rById.get(b.id)!;
      const so = sig(a as Obj, b as Obj);
      const sr = sig(ra as Obj, rb as Obj);
      if (JSON.stringify(so) === JSON.stringify(sr)) continue;
      counts.set(a.id, (counts.get(a.id) ?? 0) + 1);
      counts.set(b.id, (counts.get(b.id) ?? 0) + 1);
      const kind = (["leftOf", "above", "containedIn"] as const)
        .filter((key) => so[key] !== sr[key])
        .map((key) => `${key}:${so[key]}->${sr[key]}`)
        .join(",");
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      if (process.argv[4]) {
        if (a.id.includes(process.argv[4]) || b.id.includes(process.argv[4])) {
          console.log(`pair ${a.id} | ${b.id} | ${kind}`);
        }
      }
    }
  }
  console.log("--- objects by mismatch involvement");
  [...counts.entries()].sort((l, r) => r[1] - l[1]).slice(0, 20)
    .forEach(([id, count]) => console.log(String(count).padStart(4), id));
  console.log("--- mismatch kinds");
  [...kinds.entries()].sort((l, r) => r[1] - l[1]).slice(0, 15)
    .forEach(([kind, count]) => console.log(String(count).padStart(4), kind));
} else {
  // adjacency
  const axisGap = (s1: number, l1: number, s2: number, l2: number) =>
    Math.max(0, s2 - (s1 + l1), s1 - (s2 + l2));
  const gap = (a: Rect, b: Rect, sx = 1, sy = 1) => Math.hypot(
    axisGap(a.x, a.width, b.x, b.width) * sx,
    axisGap(a.y, a.height, b.y, b.height) * sy,
  );
  const common = document.objects.filter((o) => rById.has(o.id));
  const oExt = contentBounds(common);
  const rExt = contentBounds(common.map((o) => rById.get(o.id)!));
  const sx = oExt.width / rExt.width;
  const sy = oExt.height / rExt.height;
  let total = 0;
  let lost = 0;
  for (let i = 0; i < common.length; i += 1) {
    for (let j = i + 1; j < common.length; j += 1) {
      const a = common[i]!;
      const b = common[j]!;
      if (gap(a.geometry, b.geometry) >= 64) continue;
      const rg = gap(rById.get(a.id)!.geometry, rById.get(b.id)!.geometry, sx, sy);
      total += 1;
      if (rg >= 64) {
        lost += 1;
        console.log(`lost ${a.id} <-> ${b.id} (recon gap ${rg.toFixed(0)})`);
      }
    }
  }
  console.log(`adjacent pairs: ${total}, lost: ${lost}, preserved: ${(100 * (total - lost) / total).toFixed(1)}%`);
}


