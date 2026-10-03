/**
 * Bun / Node entry. `await useHarfBuzz()` once at startup loads harfbuzzjs
 * (WASM) and the bundled TTFs (fonts/*.ttf, located next to this module) and
 * switches the backend to exact whole-run shaping. Re-exports the core API.
 *
 * Never import this from browser code: it reads files with node:fs.
 */

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { requestBackend, type MeasureBackend } from "./backend.ts";
import { BUNDLED_FACES, type BundledFace, type FaceId } from "./faces.ts";
import { FACE_TABLES } from "./generated/tables.ts";

export * from "./index.ts";

type HarfBuzz = typeof import("harfbuzzjs");
type HbFont = InstanceType<HarfBuzz["Font"]>;
type HbFace = InstanceType<HarfBuzz["Face"]>;
type HbBlob = InstanceType<HarfBuzz["Blob"]>;
type HbFeature = InstanceType<HarfBuzz["Feature"]>;

export interface UseHarfBuzzOptions {
  /** Shaped widths kept in the LRU cache (default 20,000; one entry per face x ligature mode x run). */
  cacheEntries?: number;
}

export interface HarfBuzzStats {
  /** True once the WASM module and every face are loaded. */
  loaded: boolean;
  /** Completed loads; stays 1 however many times useHarfBuzz() is called. */
  loads: number;
  /** hb.shape calls (cache misses; a run longer than 16,384 UTF-16 units takes one per chunk). */
  shapes: number;
  cacheEntries: number;
  cacheLimit: number;
  /** UTF-16 units of the cached keys (runs of at most 4,096 units are cached). */
  cacheUnits: number;
  /** Bound on cacheUnits. */
  cacheUnitLimit: number;
  /** Longest text handed to one hb.shape call since the load, in UTF-16 units (at most 16,384). */
  largestShapedUnits: number;
}

/** Longest text shaped in one hb.shape call: HarfBuzz's buffers (WASM memory) grow to the longest run and never shrink. */
const MAX_SHAPE_UNITS = 16_384;
/** Longest run kept in the shaping cache. */
const MAX_CACHED_UNITS = 4_096;
const DEFAULT_CACHE_ENTRIES = 20_000;
/** Bound on the total length of the cached keys, in UTF-16 units. */
const CACHE_UNIT_LIMIT = 4_000_000;

/**
 * Bounded cache from run key to width in font units with least-recently-used
 * eviction in two generations: hits in the old generation move to the young
 * one, and when the young generation reaches half the entry limit or half the
 * unit limit (total key length) the old one is dropped whole. At most `limit`
 * entries and `unitLimit` units; no per-hit reordering cost.
 */
class LruCache {
  private young = new Map<string, number>();
  private old = new Map<string, number>();
  private youngUnits = 0;
  private oldUnits = 0;
  limit: number;
  readonly unitLimit: number;
  constructor(limit: number, unitLimit: number) {
    this.limit = limit;
    this.unitLimit = unitLimit;
  }
  get size(): number {
    return this.young.size + this.old.size;
  }
  get units(): number {
    return this.youngUnits + this.oldUnits;
  }
  get(key: string): number | undefined {
    const hit = this.young.get(key);
    if (hit !== undefined) return hit;
    const aged = this.old.get(key);
    if (aged !== undefined) {
      this.old.delete(key);
      this.oldUnits -= key.length;
      this.set(key, aged);
    }
    return aged;
  }
  set(key: string, value: number): void {
    if (this.young.has(key)) {
      this.young.set(key, value);
      return;
    }
    if (this.young.size >= Math.max(1, Math.floor(this.limit / 2)) || this.youngUnits + key.length > this.unitLimit / 2) {
      this.old = this.young;
      this.oldUnits = this.youngUnits;
      this.young = new Map();
      this.youngUnits = 0;
    }
    this.young.set(key, value);
    this.youngUnits += key.length;
  }
  resize(limit: number): void {
    this.limit = limit;
    // Each generation holds at most half the limit, so the total never exceeds it.
    const half = Math.max(1, Math.floor(limit / 2));
    if (this.young.size > half) {
      this.old = new Map([...this.young].slice(-half));
      this.young = new Map();
    } else if (this.old.size > half) {
      this.old = new Map([...this.old].slice(-half));
    }
    this.youngUnits = keyUnits(this.young);
    this.oldUnits = keyUnits(this.old);
  }
}

function keyUnits(map: Map<string, number>): number {
  let units = 0;
  for (const key of map.keys()) units += key.length;
  return units;
}

const cache = new LruCache(DEFAULT_CACHE_ENTRIES, CACHE_UNIT_LIMIT);
let loading: Promise<MeasureBackend> | null = null;
let loaded: MeasureBackend | null = null;
let loads = 0;
let shapes = 0;
let largestShapedUnits = 0;

let segmenter: Intl.Segmenter | null = null;

function isPrintableAsciiUnit(unit: number): boolean {
  return unit >= 0x20 && unit <= 0x7e;
}

/**
 * End of the chunk of `text` that starts at `start` (a grapheme boundary)
 * and spans at most `max` UTF-16 units: just after a space (U+0020) in the
 * chunk's last quarter when there is one, otherwise the last grapheme
 * boundary, so no chunk splits a surrogate pair or a grapheme cluster. The
 * one exception is a single cluster longer than `max` (a base with thousands
 * of combining marks): it is split between code points.
 */
function chunkEnd(text: string, start: number, max: number): number {
  const limit = start + max;
  if (limit >= text.length) return text.length;
  segmenter ??= new Intl.Segmenter(undefined, { granularity: "grapheme" });
  const floor = limit - Math.floor(max / 4);
  for (let space = text.lastIndexOf(" ", limit - 1); space >= floor - 1 && space > start; space = text.lastIndexOf(" ", space - 1)) {
    // The space ends its cluster unless a combining mark (or ZWJ, ...) follows it.
    if (isPrintableAsciiUnit(text.charCodeAt(space + 1))) return space + 1;
    const first = segmenter.segment(text.slice(space, space + 8))[Symbol.iterator]().next().value;
    if (first?.segment.length === 1) return space + 1;
  }
  // Between two printable ASCII characters there is always a boundary.
  if (isPrintableAsciiUnit(text.charCodeAt(limit - 1)) && isPrintableAsciiUnit(text.charCodeAt(limit))) return limit;
  // The last cluster start at or before `limit`. Segmenting from `start`, a
  // boundary, gives the same clusters as segmenting the whole text.
  let end = start;
  for (const { index } of segmenter.segment(text.slice(start, limit + 2))) {
    if (index > max) break;
    end = start + index;
  }
  if (end > start) return end;
  const unit = text.charCodeAt(limit - 1);
  return unit >= 0xd800 && unit <= 0xdbff ? limit - 1 : limit;
}

interface ShapingFace {
  readonly font: HbFont;
  readonly unitsPerEm: number;
  /** Keeps the WASM-side objects reachable for as long as the font is used. */
  readonly keep: readonly [HbBlob, HbFace];
}

function ttfPath(face: BundledFace): string {
  return fileURLToPath(new URL(`../fonts/${face.file}.ttf`, import.meta.url));
}

async function loadBackend(): Promise<MeasureBackend> {
  const hb: HarfBuzz = await import("harfbuzzjs");
  const files = await Promise.all(BUNDLED_FACES.map((face) => readFile(ttfPath(face))));
  const faces = new Map<FaceId, ShapingFace>();
  BUNDLED_FACES.forEach((face, index) => {
    const bytes = files[index]!;
    const blob = new hb.Blob(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    const hbFace = new hb.Face(blob, 0);
    const font = new hb.Font(hbFace);
    font.setScale(hbFace.upem, hbFace.upem);
    faces.set(face.id, { font, unitsPerEm: hbFace.upem, keep: [blob, hbFace] });
  });
  // CSS letter-spacing != 0 turns these off in browsers (Blink FontFeatures).
  const noLigatures: HbFeature[] = ["-liga", "-clig", "-dlig", "-hlig", "-calt"].map((tag) => hb.Feature.fromString(tag)!);
  const buffer = new hb.Buffer();

  /** Whole-run advance in font units; a .notdef glyph (should not occur for covered runs) counts as the face's average letter. */
  const shape = (text: string, face: BundledFace, shaping: ShapingFace, ligatures: boolean): number => {
    shapes++;
    if (text.length > largestShapedUnits) largestShapedUnits = text.length;
    buffer.reset();
    buffer.addText(text);
    buffer.guessSegmentProperties();
    hb.shape(shaping.font, buffer, ligatures ? undefined : noLigatures);
    const infos = buffer.getGlyphInfos();
    const positions = buffer.getGlyphPositions();
    let units = 0;
    for (let i = 0; i < positions.length; i++) {
      units += infos[i]!.codepoint === 0 ? FACE_TABLES[face.id].averageAdvance : positions[i]!.xAdvance;
    }
    return units;
  };

  /**
   * A run too long to shape at once is shaped in chunks of at most
   * MAX_SHAPE_UNITS and the widths are summed: kerning across a chunk
   * boundary is lost (a fraction of a px per 16,384 units).
   */
  const shapeLong = (text: string, face: BundledFace, shaping: ShapingFace, ligatures: boolean): number => {
    if (text.length <= MAX_SHAPE_UNITS) return shape(text, face, shaping, ligatures);
    let units = 0;
    for (let start = 0; start < text.length; ) {
      const end = chunkEnd(text, start, MAX_SHAPE_UNITS);
      units += shape(text.slice(start, end), face, shaping, ligatures);
      start = end;
    }
    return units;
  };

  loads++;
  largestShapedUnits = 0;
  return {
    name: "harfbuzz",
    exact: true,
    measuresFallback: false,
    measureRun(text, face, size, ligatures) {
      const shaping = faces.get(face.id)!;
      if (text.length > MAX_CACHED_UNITS) return (shapeLong(text, face, shaping, ligatures) * size) / shaping.unitsPerEm;
      const key = `${face.id}${ligatures ? "+" : "-"}${text}`;
      let units = cache.get(key);
      if (units === undefined) {
        units = shape(text, face, shaping, ligatures);
        cache.set(key, units);
      }
      return (units * size) / shaping.unitsPerEm;
    },
  };
}

/**
 * Loads harfbuzzjs and the bundled TTFs, then makes HarfBuzz the active
 * backend. Idempotent: concurrent and repeated calls share one load. The last
 * backend request wins: a useTableBackend() or useBrowserFonts() call made
 * while HarfBuzz loads takes precedence over this one, unless that newer
 * request fails. Resolves once the request is decided. Rejects when the WASM
 * module or a font file cannot be loaded (the backend stays as it is), so a
 * later call can retry.
 */
export async function useHarfBuzz(options: UseHarfBuzzOptions = {}): Promise<void> {
  if (options.cacheEntries !== undefined) {
    if (!Number.isInteger(options.cacheEntries) || options.cacheEntries < 2) {
      throw new TypeError(`text-measure: cacheEntries must be an integer >= 2, got ${String(options.cacheEntries)}`);
    }
    cache.resize(options.cacheEntries);
  }
  const request = requestBackend();
  let backend: MeasureBackend;
  try {
    loading ??= loadBackend().then(
      (ready) => (loaded = ready),
      (error: unknown) => {
        loading = null;
        throw error;
      },
    );
    backend = await loading;
  } catch (error) {
    request.fail();
    throw error;
  }
  request.complete(backend);
  await request.decided;
}

/** Diagnostics: load count, shaping-cache occupancy and the longest shaped text. */
export function harfBuzzStats(): HarfBuzzStats {
  return {
    loaded: loaded !== null,
    loads,
    shapes,
    cacheEntries: cache.size,
    cacheLimit: cache.limit,
    cacheUnits: cache.units,
    cacheUnitLimit: cache.unitLimit,
    largestShapedUnits,
  };
}
