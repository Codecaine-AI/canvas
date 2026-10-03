/**
 * Makes Pretext measure through the active backend.
 *
 * Pretext 0.0.9 creates its measuring context once per process, on first use,
 * with `new OffscreenCanvas(1, 1).getContext("2d")` (dist/measurement.js,
 * getMeasureContext) and keeps it forever. On our first use we put a shim
 * OffscreenCanvas on globalThis, trigger that creation, and restore the
 * original global right away (browsers keep their native OffscreenCanvas,
 * happy-dom keeps its own). The context Pretext keeps is ours: its
 * measureText parses ctx.font and dispatches to the active backend.
 *
 * The context reads its measuring function from a global slot at call time,
 * and every API call points the slot at this module instance first, so a
 * re-evaluated module (HMR) or a second copy of the package (with its own
 * Pretext or sharing this one) still measures Pretext through its own
 * measurer. Every copy measures with the one process-wide backend
 * (backend.ts), and a switch made by any copy flushes every copy's Pretext.
 */

import * as Pretext from "@chenglou/pretext";
import { measureRunPx, onBackendSwitchInternal } from "./backend.ts";
import { parseFontKey } from "./font.ts";

type Measurer = (text: string, font: string) => number;
interface Slot {
  measure: Measurer;
}

const SLOT_KEY = Symbol.for("@codecaine-ai/text-measure/pretext-slot");

/** measureText calls served by this instance; drives binding checks and cache trimming. */
let measureCalls = 0;
let callsAtLastClear = 0;
/** UTF-16 units of the text those calls measured. */
let measuredUnits = 0;
let unitsAtLastClear = 0;
let bound = false;
let bindAttempts = 0;

/**
 * Pretext keeps every measured segment, with its per-grapheme advances, per
 * font forever: flush its caches once this many measurements, or segments
 * this long in total (UTF-16 units), have been added since the last flush.
 */
const PRETEXT_CACHE_LIMIT = 200_000;
const PRETEXT_CACHE_UNIT_LIMIT = 4_000_000;

const ownMeasurer: Measurer = (text, font) => {
  measureCalls++;
  measuredUnits += text.length;
  const parsed = parseFontKey(font);
  return measureRunPx(text, parsed.face, parsed.size, parsed.ligatures, true);
};

function clearPretextCache(): void {
  Pretext.clearCache();
  callsAtLastClear = measureCalls;
  unitsAtLastClear = measuredUnits;
}

function slot(): Slot {
  const g = globalThis as unknown as Record<symbol, Slot | undefined>;
  let s = g[SLOT_KEY];
  if (!s) {
    s = { measure: ownMeasurer };
    Object.defineProperty(globalThis, SLOT_KEY, { value: s, configurable: true, enumerable: false, writable: true });
  }
  return s;
}

/** The 2D context Pretext holds: only `font` and `measureText` are read by Pretext. */
class TextMeasureContext {
  font = "10px sans-serif";
  letterSpacing = "0px";
  fontKerning = "auto";
  measureText(text: string): { width: number; actualBoundingBoxLeft: number; actualBoundingBoxRight: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    const width = slot().measure(String(text), this.font);
    return { width, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 };
  }
}

class ShimOffscreenCanvas {
  width: number;
  height: number;
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }
  getContext(kind: string): TextMeasureContext | null {
    return kind === "2d" ? new TextMeasureContext() : null;
  }
}

function bind(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  const original = Object.getOwnPropertyDescriptor(globalThis, "OffscreenCanvas");
  const before = measureCalls;
  bindAttempts++;
  try {
    Object.defineProperty(globalThis, "OffscreenCanvas", { value: ShimOffscreenCanvas, configurable: true, writable: true, enumerable: false });
  } catch (cause) {
    throw new Error("text-measure: cannot install the measuring shim (globalThis.OffscreenCanvas is not configurable)", { cause });
  }
  try {
    // A font string Pretext has never seen, so it must call measureText.
    Pretext.prepare("x", `400 16px "text-measure-bind-${bindAttempts}"`);
  } finally {
    if (original) Object.defineProperty(globalThis, "OffscreenCanvas", original);
    else delete g.OffscreenCanvas;
  }
  if (measureCalls === before) {
    throw new Error(
      "text-measure: @chenglou/pretext created its measuring context before text-measure could bind it, " +
        "so Pretext would not measure through the active backend. Import @codecaine-ai/text-measure " +
        "before any other code calls Pretext in this process.",
    );
  }
  bound = true;
  clearPretextCache();
}

/**
 * Pretext, bound to this instance's backend. Call at the start of every
 * synchronous API call that uses Pretext.
 */
export function pretext(): typeof Pretext {
  slot().measure = ownMeasurer;
  if (!bound) bind();
  if (measureCalls - callsAtLastClear > PRETEXT_CACHE_LIMIT || measuredUnits - unitsAtLastClear > PRETEXT_CACHE_UNIT_LIMIT) clearPretextCache();
  return Pretext;
}

/** Diagnostics for tests: whether Pretext is bound and how many measurements this instance served. */
export function pretextBindingState(): { bound: boolean; measureCalls: number } {
  return { bound, measureCalls };
}

// Every copy of the package registers its own hook (the registry is shared),
// so a switch made by any copy flushes this copy's Pretext.
onBackendSwitchInternal(() => {
  // Widths cached under the previous backend are wrong now.
  if (bound) clearPretextCache();
  else {
    callsAtLastClear = measureCalls;
    unitsAtLastClear = measuredUnits;
  }
});
