/**
 * Phase 3b verification: run the full canvases/ corpus through
 * fit -> serialize -> parse -> expand -> metrics and report
 * relation/adjacency preservation, DSL line counts, and spatial
 * decision counts per board.
 *
 * Run: bun apps/layout-lab/scratchpad/phase3b-verify.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { expandSketch } from "../src/sketch/expand";
import { fitSketch } from "../src/sketch/fit";
import { calculateSketchMetrics } from "../src/sketch/metrics";
import { parseSketch, serializeSketch } from "../src/sketch/serialize";

const CANVAS_DIR = join(import.meta.dir, "../../../canvases");

interface Row {
  board: string;
  relation: number;
  adjacency: number;
  lines: number;
  chars: number;
  dslDecisions: number;
  rawDecisions: number;
}

function contentBounds(document: InteractiveCanvasDocument) {
  const objects = document.objects;
  const left = Math.min(...objects.map(({ geometry }) => geometry.x));
  const top = Math.min(...objects.map(({ geometry }) => geometry.y));
  const right = Math.max(...objects.map(({ geometry }) => geometry.x + geometry.width));
  const bottom = Math.max(...objects.map(({ geometry }) => geometry.y + geometry.height));
  return { width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function dimensionFor(document: InteractiveCanvasDocument) {
  const bounds = contentBounds(document);
  return {
    width: Math.max(720, Math.round(bounds.width)),
    height: Math.max(480, Math.round(bounds.height)),
  };
}

const rows: Row[] = [];
const files = readdirSync(CANVAS_DIR).filter((file) => file.endsWith(".canvas.json")).sort();

for (const file of files) {
  const document = JSON.parse(
    readFileSync(join(CANVAS_DIR, file), "utf8"),
  ) as InteractiveCanvasDocument;
  const sketch = fitSketch(document);
  const text = serializeSketch(sketch);
  const parsed = parseSketch(text);
  if (JSON.stringify(parsed) !== JSON.stringify(sketch)) {
    throw new Error(`Round-trip mismatch for ${file}`);
  }
  const reconstruction = expandSketch(parsed, dimensionFor(document));
  const metrics = calculateSketchMetrics(document, reconstruction, text, parsed);
  rows.push({
    board: file.replace(".canvas.json", ""),
    relation: metrics.relationPreservation,
    adjacency: metrics.adjacencyPreservation,
    lines: text.split("\n").length,
    chars: text.length,
    dslDecisions: (metrics as { dslDecisions?: number }).dslDecisions ?? Number.NaN,
    rawDecisions: (metrics as { rawDecisions?: number }).rawDecisions ?? Number.NaN,
  });
}

const pct = (value: number) => `${(value * 100).toFixed(1)}%`;
const header = ["board", "relation", "adjacency", "lines", "chars", "dsl-dec", "raw-dec"];
const table = rows.map((row) => [
  row.board,
  pct(row.relation),
  pct(row.adjacency),
  String(row.lines),
  String(row.chars),
  Number.isNaN(row.dslDecisions) ? "-" : String(row.dslDecisions),
  Number.isNaN(row.rawDecisions) ? "-" : String(row.rawDecisions),
]);
const widths = header.map((label, column) => Math.max(
  label.length,
  ...table.map((cells) => cells[column]!.length),
));
const renderRow = (cells: readonly string[]) => cells
  .map((cell, column) => cell.padEnd(widths[column]!))
  .join("  ");
console.log(renderRow(header));
console.log(widths.map((width) => "-".repeat(width)).join("  "));
for (const cells of table) console.log(renderRow(cells));

const mean = (values: readonly number[]) => (
  values.reduce((sum, value) => sum + value, 0) / values.length
);
console.log("");
console.log(`mean relation ${pct(mean(rows.map((row) => row.relation)))}, mean adjacency ${pct(mean(rows.map((row) => row.adjacency)))}`);

// Targets
const byBoard = new Map(rows.map((row) => [row.board, row]));
const targets: Array<[string, "relation" | "adjacency", number]> = [
  ["ink-diagrams", "adjacency", 0.90],
  ["ink-diagrams", "relation", 0.92],
  ["intent-classification-2", "relation", 0.92],
  ["gc-decomp-harness", "relation", 0.93],
];
let missed = 0;
for (const [board, metric, target] of targets) {
  const row = byBoard.get(board);
  if (!row) continue;
  const value = row[metric];
  const ok = value >= target;
  if (!ok) missed += 1;
  console.log(`${ok ? "PASS" : "MISS"} ${board} ${metric} ${pct(value)} (target ${pct(target)})`);
}
if (missed > 0) process.exitCode = 1;
