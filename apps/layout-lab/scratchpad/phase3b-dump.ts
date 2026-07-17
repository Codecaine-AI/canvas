/** Dump DSL text and reconstructed geometry for one board. */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { expandSketch } from "../src/sketch/expand";
import { fitSketch } from "../src/sketch/fit";
import { parseSketch, serializeSketch } from "../src/sketch/serialize";

const board = process.argv[2] ?? "gc-decomp-harness";
const filter = process.argv[3];
const CANVAS_DIR = join(import.meta.dir, "../../../canvases");
const document = JSON.parse(
  readFileSync(join(CANVAS_DIR, `${board}.canvas.json`), "utf8"),
) as InteractiveCanvasDocument;

const sketch = fitSketch(document);
const text = serializeSketch(sketch);
console.log(text);
console.log("---");
const bounds = (() => {
  const objects = document.objects;
  const left = Math.min(...objects.map(({ geometry }) => geometry.x));
  const top = Math.min(...objects.map(({ geometry }) => geometry.y));
  const right = Math.max(...objects.map(({ geometry }) => geometry.x + geometry.width));
  const bottom = Math.max(...objects.map(({ geometry }) => geometry.y + geometry.height));
  return { width: right - left, height: bottom - top };
})();
const reconstruction = expandSketch(parseSketch(text), {
  width: Math.max(720, Math.round(bounds.width)),
  height: Math.max(480, Math.round(bounds.height)),
});
const originalById = new Map(document.objects.map((o) => [o.id, o.geometry]));
for (const object of reconstruction.objects) {
  if (filter && !object.id.includes(filter)) continue;
  const g = object.geometry;
  const o = originalById.get(object.id)!;
  console.log(
    object.id.slice(0, 30).padEnd(30),
    `recon ${g.x},${g.y} ${g.width}x${g.height}`.padEnd(28),
    `orig ${o.x},${o.y} ${o.width}x${o.height}`,
  );
}
