/**
 * Reads the table directory of a TTF and of a WOFF2 (brotli via node:zlib)
 * and compares their tables, to prove each bundled woff2 (painted by the
 * browser) is the same build as its TTF (shaped headless). Used by
 * scripts/verify-fonts.ts and test/fonts.test.ts.
 */

import { readFileSync } from "node:fs";
import { brotliDecompressSync } from "node:zlib";

const KNOWN_TAGS = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT",
  "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH",
  "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar",
  "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill",
];

export interface FontTables {
  tables: Map<string, Uint8Array>;
  /** Tables stored transformed in a WOFF2 (glyf, loca, sometimes hmtx): not byte-comparable. */
  transformed: Set<string>;
}

function tagAt(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
}

export function readTtfTables(bytes: Uint8Array): FontTables {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tables = new Map<string, Uint8Array>();
  const count = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const record = 12 + i * 16;
    const offset = view.getUint32(record + 8);
    const length = view.getUint32(record + 12);
    tables.set(tagAt(view, record), bytes.subarray(offset, offset + length));
  }
  return { tables, transformed: new Set() };
}

export function readWoff2Tables(bytes: Uint8Array): FontTables {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0) !== 0x774f4632) throw new Error("not a WOFF2 file");
  const count = view.getUint16(12);
  const compressedSize = view.getUint32(20);
  let pos = 48;
  const base128 = (): number => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = view.getUint8(pos++);
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error("bad UIntBase128");
  };
  const entries: Array<{ tag: string; length: number; transformed: boolean }> = [];
  for (let i = 0; i < count; i++) {
    const flags = view.getUint8(pos++);
    let tag: string;
    if ((flags & 0x3f) === 0x3f) {
      tag = tagAt(view, pos);
      pos += 4;
    } else {
      tag = KNOWN_TAGS[flags & 0x3f]!;
    }
    const version = flags >> 6;
    const origLength = base128();
    const transformed = tag === "glyf" || tag === "loca" ? version !== 3 : version !== 0;
    const length = transformed ? base128() : origLength;
    entries.push({ tag, length, transformed });
  }
  const stream = new Uint8Array(brotliDecompressSync(bytes.subarray(pos, pos + compressedSize)));
  const tables = new Map<string, Uint8Array>();
  const transformed = new Set<string>();
  let offset = 0;
  for (const entry of entries) {
    tables.set(entry.tag, stream.subarray(offset, offset + entry.length));
    if (entry.transformed) transformed.add(entry.tag);
    offset += entry.length;
  }
  if (offset !== stream.length) throw new Error(`WOFF2 table data is ${stream.length} bytes, directory says ${offset}`);
  return { tables, transformed };
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Tables that decide advances, kerning, shaping and coverage. */
export const LAYOUT_TABLES = ["cmap", "hhea", "hmtx", "OS/2", "GDEF", "GPOS", "GSUB", "kern", "vhea", "vmtx"];

export interface BuildComparison {
  file: string;
  /** Name ID 5 (version string) of the TTF and of the woff2. */
  version: { ttf: string; woff2: string };
  /** Layout tables present in either file, with whether they are byte-identical. */
  layout: Record<string, boolean>;
  /** head.unitsPerEm, head.fontRevision and maxp.numGlyphs agree. */
  headerFieldsMatch: boolean;
  /** Everything else that differs (hinting, timestamps, names): informational. */
  otherDifferences: string[];
  /** True when every layout table and header field matches. */
  sameBuild: boolean;
}

function nameVersion(name: Uint8Array | undefined): string {
  if (!name) return "?";
  const view = new DataView(name.buffer, name.byteOffset, name.byteLength);
  const count = view.getUint16(2);
  const strings = view.getUint16(4);
  for (let i = 0; i < count; i++) {
    const record = 6 + i * 12;
    if (view.getUint16(record + 6) !== 5) continue;
    const platform = view.getUint16(record);
    const length = view.getUint16(record + 8);
    const offset = strings + view.getUint16(record + 10);
    const raw = name.subarray(offset, offset + length);
    if (platform === 3 || platform === 0) {
      let out = "";
      for (let k = 0; k + 1 < raw.length; k += 2) out += String.fromCharCode((raw[k]! << 8) | raw[k + 1]!);
      return out;
    }
    return new TextDecoder("latin1").decode(raw);
  }
  return "?";
}

function u16(table: Uint8Array | undefined, offset: number): number {
  return table ? new DataView(table.buffer, table.byteOffset, table.byteLength).getUint16(offset) : -1;
}

function u32(table: Uint8Array | undefined, offset: number): number {
  return table ? new DataView(table.buffer, table.byteOffset, table.byteLength).getUint32(offset) : -1;
}

/**
 * Compares fonts/<file>.ttf with fonts/<file>.woff2. Same build means the
 * layout tables are byte-identical and units per em, font revision and glyph
 * count agree; hinting (the TTFs are hinted, the woff2 web builds are not),
 * timestamps, checksums and name strings may differ.
 */
export function compareBuild(fontsDir: string, file: string): BuildComparison {
  const ttf = readTtfTables(new Uint8Array(readFileSync(`${fontsDir}/${file}.ttf`)));
  const woff2 = readWoff2Tables(new Uint8Array(readFileSync(`${fontsDir}/${file}.woff2`)));
  const layout: Record<string, boolean> = {};
  for (const tag of LAYOUT_TABLES) {
    const a = ttf.tables.get(tag);
    const b = woff2.tables.get(tag);
    if (!a && !b) continue;
    // A transformed hmtx would need reconstruction; none of the bundled files transform it.
    layout[tag] = !!a && !!b && !woff2.transformed.has(tag) && equalBytes(a, b);
  }
  const headA = ttf.tables.get("head");
  const headB = woff2.tables.get("head");
  const headerFieldsMatch =
    u16(headA, 18) === u16(headB, 18) && u32(headA, 4) === u32(headB, 4) && u16(ttf.tables.get("maxp"), 4) === u16(woff2.tables.get("maxp"), 4);
  const otherDifferences: string[] = [];
  for (const tag of new Set([...ttf.tables.keys(), ...woff2.tables.keys()])) {
    if (LAYOUT_TABLES.includes(tag)) continue;
    const a = ttf.tables.get(tag);
    const b = woff2.tables.get(tag);
    if (!a) otherDifferences.push(`${tag} only in woff2`);
    else if (!b) otherDifferences.push(`${tag} only in ttf`);
    else if (woff2.transformed.has(tag)) otherDifferences.push(`${tag} transformed`);
    else if (!equalBytes(a, b)) otherDifferences.push(`${tag} differs`);
  }
  return {
    file,
    version: { ttf: nameVersion(ttf.tables.get("name")), woff2: nameVersion(woff2.tables.get("name")) },
    layout,
    headerFieldsMatch,
    otherDifferences,
    sameBuild: headerFieldsMatch && Object.values(layout).every(Boolean) && layout.cmap === true && layout.hmtx === true,
  };
}
