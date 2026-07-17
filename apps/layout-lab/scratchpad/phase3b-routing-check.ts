/** Mirror SketchView's dev gate: round-trip + corridor routing violations. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { expandSketch } from "../src/sketch/expand";
import { fitSketch } from "../src/sketch/fit";
import { countPathBoxViolations, routeSketchEdges } from "../src/sketch/route";
import { parseSketch, serializeSketch } from "../src/sketch/serialize";

const CANVAS_DIR = join(import.meta.dir, "../../../canvases");

function dimensionFor(document: InteractiveCanvasDocument) {
  const objects = document.objects;
  const left = Math.min(...objects.map(({ geometry }) => geometry.x));
  const top = Math.min(...objects.map(({ geometry }) => geometry.y));
  const right = Math.max(...objects.map(({ geometry }) => geometry.x + geometry.width));
  const bottom = Math.max(...objects.map(({ geometry }) => geometry.y + geometry.height));
  return {
    width: Math.max(720, Math.round(right - left)),
    height: Math.max(480, Math.round(bottom - top)),
  };
}

let failed = false;
for (const file of readdirSync(CANVAS_DIR).filter((name) => name.endsWith(".canvas.json")).sort()) {
  const document = JSON.parse(
    readFileSync(join(CANVAS_DIR, file), "utf8"),
  ) as InteractiveCanvasDocument;
  const fitted = fitSketch(document);
  const roundTripped = parseSketch(serializeSketch(fitted));
  if (JSON.stringify(roundTripped) !== JSON.stringify(fitted)) {
    console.log(`FAIL round-trip: ${file}`);
    failed = true;
    continue;
  }
  const expanded = expandSketch(roundTripped, dimensionFor(document));
  const routed = routeSketchEdges(expanded, "corridors");
  const violations = countPathBoxViolations(routed, expanded.objects);
  console.log(`${violations === 0 ? "ok  " : "FAIL"} ${file}: ${violations} routing violation(s)`);
  if (violations > 0) failed = true;
}
process.exitCode = failed ? 1 : 0;
