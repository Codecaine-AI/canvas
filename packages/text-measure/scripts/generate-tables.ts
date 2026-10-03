#!/usr/bin/env bun
/**
 * Generates the table backend's data and the coverage map from the bundled
 * static TTFs (fonts/*.ttf), shaping with HarfBuzz (harfbuzzjs, the same
 * shaper the headless backend uses):
 *
 *   src/generated/tables.ts    per face: advances (font units) for the common
 *                              blocks below, ASCII pair adjustments with
 *                              ligatures off (kerning), the extra adjustment
 *                              of contextual pairs and triples (Inter's arrows
 *                              such as -> and <=>, x between digits, ...), and
 *                              the average letter advance used for estimates.
 *   src/generated/coverage.ts  per face: the cmap as inclusive code point
 *                              ranges (uncoveredChars, fitText().reliable).
 *
 * Adjustments are measured, not parsed: adjustment(AB) = width(AB) - width(A)
 * - width(B) with whole-run shaping, so kerning and two-character contextual
 * substitutions are both captured without reading GPOS/GSUB by hand.
 *
 * Deterministic: the same TTFs produce byte-identical files. Run:
 *   bun canvas/packages/text-measure/scripts/generate-tables.ts
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as hb from "harfbuzzjs";
import { BUNDLED_FACES, type BundledFace } from "../src/faces.ts";

const FONTS_DIR = fileURLToPath(new URL("../fonts/", import.meta.url));
const TABLES_OUT = fileURLToPath(new URL("../src/generated/tables.ts", import.meta.url));
const COVERAGE_OUT = fileURLToPath(new URL("../src/generated/coverage.ts", import.meta.url));

/**
 * Blocks whose mapped code points get an advance in the table. Code points a
 * face maps outside these blocks measure with the face's average advance in
 * the table backend (the exact backends shape them for real).
 */
const TABLE_BLOCKS: ReadonlyArray<readonly [number, number, string]> = [
  [0x0020, 0x007e, "ASCII"],
  [0x00a0, 0x00ff, "Latin-1 Supplement"],
  [0x0100, 0x017f, "Latin Extended-A"],
  [0x0180, 0x024f, "Latin Extended-B"],
  [0x0370, 0x03ff, "Greek and Coptic"],
  [0x0400, 0x04ff, "Cyrillic"],
  [0x2000, 0x206f, "General Punctuation"],
  [0x2070, 0x209f, "Superscripts and Subscripts"],
  [0x20a0, 0x20cf, "Currency Symbols"],
  [0x2100, 0x214f, "Letterlike Symbols"],
  [0x2150, 0x218f, "Number Forms"],
  [0x2190, 0x21ff, "Arrows"],
  [0x2200, 0x22ff, "Mathematical Operators"],
  [0x2300, 0x23ff, "Miscellaneous Technical"],
  [0x2500, 0x257f, "Box Drawing"],
  [0x2580, 0x259f, "Block Elements"],
  [0x25a0, 0x25ff, "Geometric Shapes"],
  [0x2600, 0x26ff, "Miscellaneous Symbols"],
  [0x2700, 0x27bf, "Dingbats"],
];

const NO_LIGATURES = ["-liga", "-clig", "-dlig", "-hlig", "-calt"].map((f) => hb.Feature.fromString(f)!);

interface Shaper {
  /** Whole-run advance in font units; `ligatures: false` mirrors CSS letter-spacing != 0. */
  width(text: string, ligatures?: boolean): number;
  unitsPerEm: number;
  unicodes: number[];
  version: string;
}

function openFace(face: BundledFace): { shaper: Shaper; sha256: string } {
  const bytes = readFileSync(`${FONTS_DIR}${face.file}.ttf`);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const hbFace = new hb.Face(new hb.Blob(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), 0);
  const hbFont = new hb.Font(hbFace);
  hbFont.setScale(hbFace.upem, hbFace.upem);
  const buffer = new hb.Buffer();
  const width = (text: string, ligatures = true): number => {
    buffer.reset();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    hb.shape(hbFont, buffer, ligatures ? undefined : NO_LIGATURES);
    let sum = 0;
    for (const position of buffer.getGlyphPositions()) sum += position.xAdvance;
    return sum;
  };
  const unicodes = [...hbFace.collectUnicodes()].sort((a, b) => a - b);
  return {
    sha256,
    shaper: { width, unitsPerEm: hbFace.upem, unicodes, version: hbFace.getName(5, "en") },
  };
}

function toRanges(sorted: readonly number[]): number[] {
  const flat: number[] = [];
  for (const cp of sorted) {
    const last = flat.length - 1;
    if (last >= 1 && flat[last] === cp - 1) flat[last] = cp;
    else flat.push(cp, cp);
  }
  return flat;
}

/** "start:v,v,v*n start:..." with hex starts and run-length repeats. */
function encodeAdvances(advances: ReadonlyMap<number, number>): string {
  const cps = [...advances.keys()].sort((a, b) => a - b);
  const parts: string[] = [];
  let i = 0;
  while (i < cps.length) {
    const start = cps[i]!;
    const values: number[] = [];
    while (i < cps.length && cps[i] === start + values.length) values.push(advances.get(cps[i++]!)!);
    const items: string[] = [];
    for (let k = 0; k < values.length; ) {
      let n = 1;
      while (k + n < values.length && values[k + n] === values[k]) n++;
      items.push(n > 2 ? `${values[k]}*${n}` : Array(n).fill(String(values[k])).join(","));
      k += n;
    }
    parts.push(`${start.toString(16)}:${items.join(",")}`);
  }
  return parts.join(" ");
}

/** Pairs or triples grouped by adjustment: { "-192": "AVAW..." } (fixed-length keys, concatenated). */
function encodeGroups(pairs: ReadonlyMap<string, number>): Record<string, string> {
  const byValue = new Map<number, string[]>();
  for (const [pair, value] of [...pairs.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
    const list = byValue.get(value) ?? [];
    list.push(pair);
    byValue.set(value, list);
  }
  const out: Record<string, string> = {};
  for (const value of [...byValue.keys()].sort((a, b) => a - b)) out[String(value)] = byValue.get(value)!.join("");
  return out;
}

const ASCII: string[] = [];
for (let cp = 0x20; cp <= 0x7e; cp++) ASCII.push(String.fromCharCode(cp));
const ASCII_PUNCT = ASCII.filter((ch) => /[^A-Za-z0-9 ]/.test(ch));
const LETTERS = ASCII.filter((ch) => /[A-Za-z]/.test(ch));

interface FaceOut {
  face: BundledFace;
  sha256: string;
  version: string;
  unitsPerEm: number;
  averageAdvance: number;
  advances: string;
  advanceCount: number;
  kerning: Record<string, string>;
  kerningCount: number;
  ligaturePairs: Record<string, string>;
  ligatureTriples: Record<string, string>;
  tripleCount: number;
  coverage: number[];
  unicodeCount: number;
}

const results: FaceOut[] = [];
for (const face of BUNDLED_FACES) {
  const { shaper, sha256 } = openFace(face);
  const mapped = new Set(shaper.unicodes);

  const advances = new Map<number, number>();
  for (const [start, end] of TABLE_BLOCKS) {
    for (let cp = start; cp <= end; cp++) {
      if (mapped.has(cp)) advances.set(cp, shaper.width(String.fromCodePoint(cp)));
    }
  }

  const single = new Map<string, number>(ASCII.map((ch) => [ch, shaper.width(ch)]));
  const kerning = new Map<string, number>();
  const ligaturePairs = new Map<string, number>();
  const pairOn = new Map<string, number>();
  for (const a of ASCII) {
    for (const b of ASCII) {
      const base = single.get(a)! + single.get(b)!;
      const off = shaper.width(a + b, false) - base;
      const on = shaper.width(a + b, true) - base;
      pairOn.set(a + b, on);
      if (off !== 0) kerning.set(a + b, off);
      if (on !== off) ligaturePairs.set(a + b, on - off);
    }
  }

  // Contextual alternates that depend on both neighbours (Inter's arrows such as <=> and -->,
  // x between digits becoming a multiplication sign, ...) are not the sum of their pairs:
  // record what every ASCII triple adds over its pair prediction (ligatures on).
  const ligatureTriples = new Map<string, number>();
  for (const a of ASCII) {
    for (const b of ASCII) {
      for (const c of ASCII) {
        const text = a + b + c;
        const predicted = single.get(a)! + single.get(b)! + single.get(c)! + pairOn.get(a + b)! + pairOn.get(b + c)!;
        const extra = shaper.width(text, true) - predicted;
        if (extra !== 0) ligatureTriples.set(text, extra);
      }
    }
  }
  // With ligatures off only kerning remains, which is pairwise: check it on punctuation runs.
  let offTripleDrift = 0;
  for (const a of ASCII_PUNCT) {
    for (const b of ASCII_PUNCT) {
      for (const c of ASCII_PUNCT) {
        const predictedOff = single.get(a)! + single.get(b)! + single.get(c)! + (kerning.get(a + b) ?? 0) + (kerning.get(b + c) ?? 0);
        if (shaper.width(a + b + c, false) !== predictedOff) offTripleDrift++;
      }
    }
  }
  if (offTripleDrift > 0) console.warn(`${face.id}: ${offTripleDrift} punctuation triples are not pair-additive with ligatures off`);

  const averageAdvance = Math.round(LETTERS.reduce((sum, ch) => sum + single.get(ch)!, 0) / LETTERS.length);

  results.push({
    face,
    sha256,
    version: shaper.version,
    unitsPerEm: shaper.unitsPerEm,
    averageAdvance,
    advances: encodeAdvances(advances),
    advanceCount: advances.size,
    kerning: encodeGroups(kerning),
    kerningCount: kerning.size,
    ligaturePairs: encodeGroups(ligaturePairs),
    ligatureTriples: encodeGroups(ligatureTriples),
    tripleCount: ligatureTriples.size,
    coverage: toRanges(shaper.unicodes),
    unicodeCount: shaper.unicodes.length,
  });
}

const header = (what: string) => `/**
 * GENERATED FILE, do not edit. Regenerate with:
 *   bun canvas/packages/text-measure/scripts/generate-tables.ts
 *
 * ${what}
 * Source: fonts/*.ttf (Inter 3.19 static, IBM Plex Mono 2.5), shaped with
 * harfbuzzjs. Each face records the sha256 of the TTF it was generated from;
 * test/generated.test.ts fails when a font changes without regenerating.
 */
`;

const tablesSource = `${header("Table backend data: advances in font units, ASCII pair adjustments with\n * ligatures off (kerning), ligature extras (pairs and punctuation triples),\n * and the average letter advance used to estimate unknown widths.")}
import type { FaceId } from "../faces.ts";

export interface FaceTableData {
  readonly file: string;
  readonly sha256: string;
  readonly version: string;
  readonly unitsPerEm: number;
  /** Mean advance of A-Z and a-z, the estimate for glyphs outside the table. */
  readonly averageAdvance: number;
  /** "startHex:v,v,v*n ..." runs of advances (font units) by code point. */
  readonly advances: string;
  /** Kerning (ligatures off): adjustment -> concatenated two-character pairs. */
  readonly kerning: Readonly<Record<string, string>>;
  /** Extra adjustment of a pair when ligatures are on (CSS letter-spacing is 0). */
  readonly ligaturePairs: Readonly<Record<string, string>>;
  /** Extra adjustment of a three-character run over its pair prediction, ligatures on: adjustment -> concatenated triples. */
  readonly ligatureTriples: Readonly<Record<string, string>>;
}

export const FACE_TABLES: Readonly<Record<FaceId, FaceTableData>> = {
${results
  .map(
    (r) => `  ${JSON.stringify(r.face.id)}: {
    file: ${JSON.stringify(r.face.file)},
    sha256: ${JSON.stringify(r.sha256)},
    version: ${JSON.stringify(r.version)},
    unitsPerEm: ${r.unitsPerEm},
    averageAdvance: ${r.averageAdvance},
    advances: ${JSON.stringify(r.advances)},
    kerning: ${JSON.stringify(r.kerning)},
    ligaturePairs: ${JSON.stringify(r.ligaturePairs)},
    ligatureTriples: ${JSON.stringify(r.ligatureTriples)},
  },`,
  )
  .join("\n")}
};
`;

// Faces of one family share a character set; emit each distinct range list once.
const distinct = new Map<string, string>();
const coverageRefs: string[] = [];
for (const r of results) {
  const key = JSON.stringify(r.coverage);
  let name = distinct.get(key);
  if (!name) {
    name = `RANGES_${distinct.size}`;
    distinct.set(key, name);
  }
  coverageRefs.push(`  ${JSON.stringify(r.face.id)}: ${name},`);
}
const coverageSource = `${header("Unicode coverage of each bundled face: its cmap as flattened inclusive\n * [start, end, start, end, ...] code point ranges, ascending.")}
import type { FaceId } from "../faces.ts";

${[...distinct.entries()].map(([json, name]) => `const ${name}: readonly number[] = ${json};`).join("\n")}

export const FACE_COVERAGE: Readonly<Record<FaceId, readonly number[]>> = {
${coverageRefs.join("\n")}
};
`;

writeFileSync(TABLES_OUT, tablesSource);
writeFileSync(COVERAGE_OUT, coverageSource);

for (const r of results) {
  console.log(
    `${r.face.id.padEnd(14)} ${r.version.padEnd(28)} upem ${r.unitsPerEm}  advances ${String(r.advanceCount).padStart(4)}  kerning pairs ${String(r.kerningCount).padStart(4)}  ligature pairs ${Object.values(r.ligaturePairs).join("").length / 2}  triples ${r.tripleCount}  cmap ${r.unicodeCount} in ${r.coverage.length / 2} ranges`,
  );
}
console.log(`wrote ${TABLES_OUT} (${Buffer.byteLength(tablesSource)} bytes), ${COVERAGE_OUT} (${Buffer.byteLength(coverageSource)} bytes)`);
