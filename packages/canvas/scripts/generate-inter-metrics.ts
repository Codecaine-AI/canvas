#!/usr/bin/env bun
/**
 * Generates src/render/inter-metrics.generated.ts — the static renderer's
 * per-glyph advance-width table — from the app's bundled Inter variable TTF
 * (packages/canvas-agent/assets/fonts/Inter-Variable.ttf, read here only).
 *
 * Run from the repo root (idempotent — same font in, byte-identical file out):
 *
 *   bun packages/canvas/scripts/generate-inter-metrics.ts
 *
 * The script is a minimal sfnt parser (no dependencies):
 *   - head        units-per-em
 *   - maxp/hhea   glyph and h-metric counts
 *   - hmtx        advance widths of the font's DEFAULT instance (wght 400)
 *   - cmap        codepoint → glyph (format 12 preferred, format 4 fallback)
 *   - fvar + HVAR advance deltas at wght 700 — the same variation math the
 *                 browser applies for font-weight 700 text (this font has no
 *                 avar table, so axis normalization is the plain linear map)
 *
 * Emitted coverage: ASCII, Latin-1, general punctuation (dashes, quotes,
 * bullet, ellipsis, primes, guillemets), arrows U+2190–U+21FF, and the small
 * symbol set the app can produce (minus sign, ≠ ≤ ≥ ≈, geometric bullets
 * ▪ ● ◦, check marks). Codepoints the font's cmap does not map are omitted
 * from the table; consumers use the emitted fallback advance for them.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FONT_PATH = join(
  SCRIPT_DIR,
  "../../canvas-agent/assets/fonts/Inter-Variable.ttf",
);
const OUTPUT_PATH = join(SCRIPT_DIR, "../src/render/inter-metrics.generated.ts");

/** Codepoint coverage: inclusive ranges plus a few singles (see file header). */
const COVERAGE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x20, 0x7e], // ASCII
  [0xa0, 0xff], // Latin-1
  [0x2010, 0x2027], // hyphens, dashes, quotes, daggers, bullet, ellipsis
  [0x2030, 0x203a], // permille, primes, single guillemets
  [0x2190, 0x21ff], // arrows
];
const COVERAGE_SINGLES: readonly number[] = [
  0x2212, // minus sign
  0x2248, // almost equal
  0x2260, // not equal
  0x2264, // less-than or equal
  0x2265, // greater-than or equal
  0x25aa, // black small square (sticky bullet depth 2+)
  0x25cf, // black circle
  0x25e6, // white bullet (sticky bullet depth 1)
  0x2713, // check mark
  0x2717, // ballot x
];

// ---------------------------------------------------------------------------
// sfnt table directory
// ---------------------------------------------------------------------------

function tableDirectory(view: DataView): Map<string, { offset: number; length: number }> {
  const numTables = view.getUint16(4);
  const tables = new Map<string, { offset: number; length: number }>();
  for (let index = 0; index < numTables; index += 1) {
    const record = 12 + index * 16;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    tables.set(tag, {
      offset: view.getUint32(record + 8),
      length: view.getUint32(record + 12),
    });
  }
  return tables;
}

function requireTable(
  tables: Map<string, { offset: number; length: number }>,
  tag: string,
): { offset: number; length: number } {
  const table = tables.get(tag);
  if (!table) throw new Error(`font is missing required table "${tag}"`);
  return table;
}

// ---------------------------------------------------------------------------
// cmap — best unicode subtable, format 12 preferred over format 4
// ---------------------------------------------------------------------------

function parseCmap(view: DataView, cmapOffset: number): Map<number, number> {
  const numSubtables = view.getUint16(cmapOffset + 2);
  let best: { offset: number; format: number } | null = null;
  for (let index = 0; index < numSubtables; index += 1) {
    const record = cmapOffset + 4 + index * 8;
    const platformId = view.getUint16(record);
    const encodingId = view.getUint16(record + 2);
    const subtableOffset = cmapOffset + view.getUint32(record + 4);
    const unicode =
      platformId === 0 || (platformId === 3 && (encodingId === 1 || encodingId === 10));
    if (!unicode) continue;
    const format = view.getUint16(subtableOffset);
    if (format !== 4 && format !== 12) continue;
    if (!best || format > best.format) best = { offset: subtableOffset, format };
  }
  if (!best) throw new Error("font has no unicode cmap subtable (format 4 or 12)");

  const mapping = new Map<number, number>();
  if (best.format === 12) {
    const groupCount = view.getUint32(best.offset + 12);
    for (let group = 0; group < groupCount; group += 1) {
      const record = best.offset + 16 + group * 12;
      const startChar = view.getUint32(record);
      const endChar = view.getUint32(record + 4);
      const startGlyph = view.getUint32(record + 8);
      for (let cp = startChar; cp <= endChar; cp += 1) {
        mapping.set(cp, startGlyph + (cp - startChar));
      }
    }
    return mapping;
  }

  // Format 4.
  const segCount = view.getUint16(best.offset + 6) / 2;
  const endCodes = best.offset + 14;
  const startCodes = endCodes + segCount * 2 + 2;
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;
  for (let seg = 0; seg < segCount; seg += 1) {
    const endCode = view.getUint16(endCodes + seg * 2);
    const startCode = view.getUint16(startCodes + seg * 2);
    const idDelta = view.getInt16(idDeltas + seg * 2);
    const idRangeOffset = view.getUint16(idRangeOffsets + seg * 2);
    if (startCode === 0xffff) continue;
    for (let cp = startCode; cp <= endCode; cp += 1) {
      let glyph: number;
      if (idRangeOffset === 0) {
        glyph = (cp + idDelta) & 0xffff;
      } else {
        const glyphAddress = idRangeOffsets + seg * 2 + idRangeOffset + (cp - startCode) * 2;
        const raw = view.getUint16(glyphAddress);
        glyph = raw === 0 ? 0 : (raw + idDelta) & 0xffff;
      }
      if (glyph !== 0) mapping.set(cp, glyph);
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// fvar — axis order and linear normalization (this font carries no avar)
// ---------------------------------------------------------------------------

interface FvarAxis {
  tag: string;
  min: number;
  def: number;
  max: number;
}

function parseFvar(view: DataView, fvarOffset: number): FvarAxis[] {
  const axesArrayOffset = view.getUint16(fvarOffset + 4);
  const axisCount = view.getUint16(fvarOffset + 8);
  const axisSize = view.getUint16(fvarOffset + 10);
  const axes: FvarAxis[] = [];
  for (let index = 0; index < axisCount; index += 1) {
    const record = fvarOffset + axesArrayOffset + index * axisSize;
    const tag = String.fromCharCode(
      view.getUint8(record),
      view.getUint8(record + 1),
      view.getUint8(record + 2),
      view.getUint8(record + 3),
    );
    axes.push({
      tag,
      min: view.getInt32(record + 4) / 65536,
      def: view.getInt32(record + 8) / 65536,
      max: view.getInt32(record + 12) / 65536,
    });
  }
  return axes;
}

/** Linear default-relative normalization, quantized to F2DOT14 like the OT spec requires. */
function normalizedAxisCoord(axis: FvarAxis, value: number): number {
  let normalized = 0;
  if (value < axis.def) {
    normalized = axis.def === axis.min ? 0 : -(axis.def - value) / (axis.def - axis.min);
  } else if (value > axis.def) {
    normalized = axis.max === axis.def ? 0 : (value - axis.def) / (axis.max - axis.def);
  }
  return Math.round(normalized * 16384) / 16384;
}

// ---------------------------------------------------------------------------
// HVAR — advance deltas via the item variation store
// ---------------------------------------------------------------------------

interface ItemVariationData {
  itemCount: number;
  wordDeltaCount: number;
  longWords: boolean;
  regionIndexes: number[];
  deltaSetsOffset: number;
}

interface ItemVariationStore {
  regionScalars: number[];
  data: ItemVariationData[];
}

/** Per-region scalar at the normalized design-space coordinates. */
function regionScalar(
  view: DataView,
  regionOffset: number,
  axisCount: number,
  coords: readonly number[],
): number {
  let scalar = 1;
  for (let axis = 0; axis < axisCount; axis += 1) {
    const record = regionOffset + axis * 6;
    const start = view.getInt16(record) / 16384;
    const peak = view.getInt16(record + 2) / 16384;
    const end = view.getInt16(record + 4) / 16384;
    if (peak === 0) continue;
    const coord = coords[axis] ?? 0;
    if (coord === peak) continue;
    if (coord < start || coord > end) return 0;
    if (coord < peak) {
      scalar *= peak === start ? 0 : (coord - start) / (peak - start);
    } else {
      scalar *= peak === end ? 0 : (end - coord) / (end - peak);
    }
  }
  return scalar;
}

function parseItemVariationStore(
  view: DataView,
  storeOffset: number,
  coords: readonly number[],
): ItemVariationStore {
  const regionListOffset = storeOffset + view.getUint32(storeOffset + 2);
  const dataCount = view.getUint16(storeOffset + 6);

  const axisCount = view.getUint16(regionListOffset);
  const regionCount = view.getUint16(regionListOffset + 2);
  const regionScalars: number[] = [];
  for (let region = 0; region < regionCount; region += 1) {
    regionScalars.push(
      regionScalar(view, regionListOffset + 4 + region * axisCount * 6, axisCount, coords),
    );
  }

  const data: ItemVariationData[] = [];
  for (let index = 0; index < dataCount; index += 1) {
    const dataOffset = storeOffset + view.getUint32(storeOffset + 8 + index * 4);
    const itemCount = view.getUint16(dataOffset);
    const wordDeltaCountRaw = view.getUint16(dataOffset + 2);
    const regionIndexCount = view.getUint16(dataOffset + 4);
    const regionIndexes: number[] = [];
    for (let region = 0; region < regionIndexCount; region += 1) {
      regionIndexes.push(view.getUint16(dataOffset + 6 + region * 2));
    }
    data.push({
      itemCount,
      wordDeltaCount: wordDeltaCountRaw & 0x7fff,
      longWords: (wordDeltaCountRaw & 0x8000) !== 0,
      regionIndexes,
      deltaSetsOffset: dataOffset + 6 + regionIndexCount * 2,
    });
  }
  return { regionScalars, data };
}

function deltaForItem(
  view: DataView,
  store: ItemVariationStore,
  outer: number,
  inner: number,
): number {
  const data = store.data[outer];
  if (!data || inner >= data.itemCount) return 0;
  const regionCount = data.regionIndexes.length;
  const wordSize = data.longWords ? 4 : 2;
  const smallSize = data.longWords ? 2 : 1;
  const rowSize = data.wordDeltaCount * wordSize + (regionCount - data.wordDeltaCount) * smallSize;
  let cursor = data.deltaSetsOffset + inner * rowSize;
  let total = 0;
  for (let region = 0; region < regionCount; region += 1) {
    let delta: number;
    if (region < data.wordDeltaCount) {
      delta = data.longWords ? view.getInt32(cursor) : view.getInt16(cursor);
      cursor += wordSize;
    } else {
      delta = data.longWords ? view.getInt16(cursor) : view.getInt8(cursor);
      cursor += smallSize;
    }
    const scalar = store.regionScalars[data.regionIndexes[region] ?? 0] ?? 0;
    total += delta * scalar;
  }
  return total;
}

/** glyph → (outer, inner) delta-set index from HVAR's advance mapping (identity when absent). */
function advanceDeltaSetIndex(
  view: DataView,
  mappingOffset: number | null,
  glyph: number,
): { outer: number; inner: number } {
  if (mappingOffset === null) return { outer: 0, inner: glyph };
  const entryFormat = view.getUint16(mappingOffset);
  const mapCount = view.getUint16(mappingOffset + 2);
  const innerBits = (entryFormat & 0x000f) + 1;
  const entrySize = ((entryFormat & 0x0030) >> 4) + 1;
  const index = Math.min(glyph, mapCount - 1);
  let entry = 0;
  for (let byte = 0; byte < entrySize; byte += 1) {
    entry = entry * 256 + view.getUint8(mappingOffset + 4 + index * entrySize + byte);
  }
  return { outer: entry >>> innerBits, inner: entry & ((1 << innerBits) - 1) };
}

/** OpenType rounding (fontTools otRound): floor(x + 0.5). */
function otRound(value: number): number {
  return Math.floor(value + 0.5);
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

const bytes = readFileSync(FONT_PATH);
const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
const tables = tableDirectory(view);

const head = requireTable(tables, "head");
const unitsPerEm = view.getUint16(head.offset + 18);

const maxp = requireTable(tables, "maxp");
const numGlyphs = view.getUint16(maxp.offset + 4);

const hhea = requireTable(tables, "hhea");
const numberOfHMetrics = view.getUint16(hhea.offset + 34);

const hmtx = requireTable(tables, "hmtx");
function defaultAdvance(glyph: number): number {
  const index = Math.min(glyph, numberOfHMetrics - 1);
  return view.getUint16(hmtx.offset + index * 4);
}

const cmap = parseCmap(view, requireTable(tables, "cmap").offset);

const fvarAxes = parseFvar(view, requireTable(tables, "fvar").offset);
const BOLD_INSTANCE: Record<string, number> = { wght: 700 };
const boldCoords = fvarAxes.map((axis) =>
  normalizedAxisCoord(axis, BOLD_INSTANCE[axis.tag] ?? axis.def),
);

const hvar = requireTable(tables, "HVAR");
const hvarStoreOffset = hvar.offset + view.getUint32(hvar.offset + 4);
const hvarAdvanceMapOffset = view.getUint32(hvar.offset + 8);
const advanceMapOffset = hvarAdvanceMapOffset === 0 ? null : hvar.offset + hvarAdvanceMapOffset;
const boldStore = parseItemVariationStore(view, hvarStoreOffset, boldCoords);

function boldAdvance(glyph: number): number {
  const { outer, inner } = advanceDeltaSetIndex(view, advanceMapOffset, glyph);
  return otRound(defaultAdvance(glyph) + deltaForItem(view, boldStore, outer, inner));
}

const coveredCodepoints: number[] = [];
for (const [start, end] of COVERAGE_RANGES) {
  for (let cp = start; cp <= end; cp += 1) coveredCodepoints.push(cp);
}
coveredCodepoints.push(...COVERAGE_SINGLES);
coveredCodepoints.sort((a, b) => a - b);

const regular = new Map<number, number>();
const bold = new Map<number, number>();
for (const cp of coveredCodepoints) {
  const glyph = cmap.get(cp);
  if (glyph === undefined || glyph === 0 || glyph >= numGlyphs) continue;
  regular.set(cp, defaultAdvance(glyph));
  bold.set(cp, boldAdvance(glyph));
}

function meanAdvance(map: Map<number, number>): number {
  let total = 0;
  for (const advance of map.values()) total += advance;
  return Math.round(total / map.size);
}

/** Contiguous covered codepoints collapse into { start, advances[] } runs. */
function toRanges(map: Map<number, number>): Array<{ start: number; advances: number[] }> {
  const ranges: Array<{ start: number; advances: number[] }> = [];
  let current: { start: number; advances: number[] } | null = null;
  for (const cp of [...map.keys()].sort((a, b) => a - b)) {
    if (current && cp === current.start + current.advances.length) {
      current.advances.push(map.get(cp)!);
    } else {
      current = { start: cp, advances: [map.get(cp)!] };
      ranges.push(current);
    }
  }
  return ranges;
}

function hex(cp: number): string {
  return `0x${cp.toString(16)}`;
}

function rangeLiteral(range: { start: number; advances: number[] }): string {
  return `  { start: ${hex(range.start)}, advances: [${range.advances.join(", ")}] },`;
}

const regularRanges = toRanges(regular);
const boldRanges = toRanges(bold);

const output = `/**
 * GENERATED FILE — do not edit by hand.
 * Regenerate: bun packages/canvas/scripts/generate-inter-metrics.ts
 *
 * Advance widths (font units) parsed from the app's bundled Inter variable
 * TTF (packages/canvas-agent/assets/fonts/Inter-Variable.ttf).
 *
 * - \`INTER_ADVANCES_REGULAR\` reflects the font's DEFAULT INSTANCE
 *   (wght 400) straight from hmtx — what the browser uses for normal-weight
 *   Inter text.
 * - \`INTER_ADVANCES_BOLD\` is the wght-700 instance (hmtx + the HVAR
 *   advance deltas at the normalized wght coordinate) — what the browser
 *   uses for font-weight 700 Inter text.
 *
 * Coverage: ASCII, Latin-1, general punctuation, arrows U+2190–U+21FF and a
 * small symbol set; codepoints the font's cmap does not map are omitted.
 * Consumers use the fallback advances (rounded mean of the covered set) for
 * uncovered codepoints — see render/text-metrics.ts.
 */

export interface InterAdvanceRange {
  /** First codepoint of the run. */
  readonly start: number;
  /** Advance widths (font units) for start, start+1, … in order. */
  readonly advances: readonly number[];
}

/** Font units per em (head.unitsPerEm). */
export const INTER_UNITS_PER_EM = ${unitsPerEm};

/** Fallback advance (font units) for codepoints outside the table. */
export const INTER_FALLBACK_ADVANCE_REGULAR = ${meanAdvance(regular)};
export const INTER_FALLBACK_ADVANCE_BOLD = ${meanAdvance(bold)};

export const INTER_ADVANCES_REGULAR: readonly InterAdvanceRange[] = [
${regularRanges.map(rangeLiteral).join("\n")}
];

export const INTER_ADVANCES_BOLD: readonly InterAdvanceRange[] = [
${boldRanges.map(rangeLiteral).join("\n")}
];
`;

writeFileSync(OUTPUT_PATH, output);
console.log(
  `wrote ${OUTPUT_PATH}: upem ${unitsPerEm}, ${regular.size} covered codepoints ` +
    `(regular mean ${meanAdvance(regular)}, bold mean ${meanAdvance(bold)})`,
);
