/**
 * The table backend: generated per-face advances plus ASCII pair and triple
 * adjustments (kerning; Inter's contextual alternates such as the -> arrow).
 * Synchronous and always
 * available, so it is the default until a host switches to an exact backend.
 * Approximate: no kerning outside ASCII, no contextual shaping beyond ASCII
 * pairs and triples, average advance for covered glyphs outside the
 * generated blocks.
 */

import { registerDefaultBackend, type MeasureBackend } from "./backend.ts";
import type { BundledFace, FaceId } from "./faces.ts";
import { FACE_TABLES, type FaceTableData } from "./generated/tables.ts";
import { isControl, isDefaultIgnorable } from "./text.ts";

const MISSING = 0xffff;
const MARK_RE = /^[\p{Mn}\p{Me}]$/u;

interface DecodedTable {
  readonly unitsPerEm: number;
  readonly average: number;
  readonly advances: Uint16Array;
  readonly kerning: Int16Array;
  readonly ligaturePairs: Int16Array;
  readonly triples: ReadonlyMap<string, number>;
  /** Middle characters of the recorded triples (cheap pre-check: no match, no triple). */
  readonly tripleMiddles: RegExp | null;
}

function decodeAdvances(encoded: string): Uint16Array {
  const entries: Array<[number, number]> = [];
  let max = 0;
  for (const part of encoded.split(" ")) {
    const colon = part.indexOf(":");
    let cp = parseInt(part.slice(0, colon), 16);
    for (const item of part.slice(colon + 1).split(",")) {
      const star = item.indexOf("*");
      const value = Number(star < 0 ? item : item.slice(0, star));
      const count = star < 0 ? 1 : Number(item.slice(star + 1));
      for (let k = 0; k < count; k++) entries.push([cp++, value]);
    }
    max = Math.max(max, cp);
  }
  const advances = new Uint16Array(max).fill(MISSING);
  for (const [cp, value] of entries) advances[cp] = value;
  return advances;
}

function decodePairs(groups: Readonly<Record<string, string>>): Int16Array {
  const pairs = new Int16Array(128 * 128);
  for (const [value, list] of Object.entries(groups)) {
    for (let i = 0; i + 1 < list.length; i += 2) pairs[list.charCodeAt(i) * 128 + list.charCodeAt(i + 1)] = Number(value);
  }
  return pairs;
}

function decodeTriples(groups: Readonly<Record<string, string>>): Map<string, number> {
  const triples = new Map<string, number>();
  for (const [value, list] of Object.entries(groups)) {
    for (let i = 0; i + 2 < list.length; i += 3) triples.set(list.slice(i, i + 3), Number(value));
  }
  return triples;
}

function escapeClass(chars: Iterable<string>): string {
  return [...chars].map((ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`).join("");
}

const decoded = new Map<FaceId, DecodedTable>();

function table(face: BundledFace): DecodedTable {
  let t = decoded.get(face.id);
  if (!t) {
    const data: FaceTableData = FACE_TABLES[face.id];
    const triples = decodeTriples(data.ligatureTriples);
    const middles = new Set<string>();
    for (const key of triples.keys()) middles.add(key[1]!);
    t = {
      unitsPerEm: data.unitsPerEm,
      average: data.averageAdvance,
      advances: decodeAdvances(data.advances),
      kerning: decodePairs(data.kerning),
      ligaturePairs: decodePairs(data.ligaturePairs),
      triples,
      tripleMiddles: middles.size > 0 ? new RegExp(`[${escapeClass(middles)}]`) : null,
    };
    decoded.set(face.id, t);
  }
  return t;
}

/** Advance sum of one run in font units. */
function runUnits(text: string, t: DecodedTable, ligatures: boolean): number {
  let units = 0;
  let prev = -1;
  for (let i = 0; i < text.length; i++) {
    let cp = text.charCodeAt(i);
    if (cp >= 0xd800 && cp <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        cp = ((cp - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
        i++;
      }
    }
    if (isControl(cp) || isDefaultIgnorable(cp)) continue;
    if (cp >= 0x300 && prev >= 0 && MARK_RE.test(String.fromCodePoint(cp))) continue;
    const advance = cp < t.advances.length ? t.advances[cp]! : MISSING;
    units += advance === MISSING ? t.average : advance;
    if (prev >= 0 && prev < 128 && cp < 128) {
      const pair = prev * 128 + cp;
      units += t.kerning[pair]!;
      if (ligatures) units += t.ligaturePairs[pair]!;
    }
    prev = cp;
  }
  if (ligatures && t.tripleMiddles && text.length >= 3 && t.tripleMiddles.test(text.slice(1, -1))) {
    for (let i = 0; i + 3 <= text.length; i++) {
      const extra = t.triples.get(text.slice(i, i + 3));
      if (extra !== undefined) units += extra;
    }
  }
  return units;
}

/**
 * Kerning (px) of the ASCII pairs at word separators in `text`: pairs that
 * touch a space (Inter kerns ", " and ". " at weights 500-700) and pairs that
 * span a zero-width space. Chromium's canvas measureText shapes the words
 * between separators separately and loses exactly these, while the DOM
 * shapes the whole run; the canvas backend adds them back.
 */
export function spaceKerningPx(text: string, face: BundledFace, size: number): number {
  const hasSpace = text.includes(" ");
  const hasZwsp = text.includes("​");
  if (!hasSpace && !hasZwsp) return 0;
  const t = table(face);
  let units = 0;
  for (let i = 1; i < text.length; i++) {
    const a = text.charCodeAt(i - 1);
    const b = text.charCodeAt(i);
    if (hasSpace && (a === 0x20 || b === 0x20) && a < 128 && b < 128) units += t.kerning[a * 128 + b]!;
    if (hasZwsp && b === 0x200b && i + 1 < text.length) {
      const c = text.charCodeAt(i + 1);
      if (a < 128 && c < 128) units += t.kerning[a * 128 + c]!;
    }
  }
  return (units * size) / t.unitsPerEm;
}

export const tableBackend: MeasureBackend = {
  name: "table",
  exact: false,
  measuresFallback: false,
  measureRun(text, face, size, ligatures) {
    const t = table(face);
    return (runUnits(text, t, ligatures) * size) / t.unitsPerEm;
  },
};

registerDefaultBackend(tableBackend);
