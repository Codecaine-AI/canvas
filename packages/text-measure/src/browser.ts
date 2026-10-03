/**
 * Browser entry. `await useBrowserFonts()` loads the bundled woff2 faces (all
 * seven, or the ones `faces` names; from the page's fonts.css @font-face
 * rules when present, otherwise as FontFace objects from this package's
 * fonts/ directory), checks that the loaded faces are the bundled builds, and
 * switches the backend to the browser's own canvas measureText for those
 * faces. Until then (and if anything fails) the previous backend stays
 * active. Re-run layout on onBackendChange(). Re-exports the core API.
 */

import { activeBackend, requestBackend, type MeasureBackend } from "./backend.ts";
import { BUNDLED_FACES, BUNDLED_FAMILIES, type BundledFace, type BundledFamily, type FaceId } from "./faces.ts";
import { spaceKerningPx, tableBackend } from "./table-backend.ts";
import { countSpacingGraphemes } from "./text.ts";
import type { BackendName } from "./types.ts";

export * from "./index.ts";

export interface UseBrowserFontsOptions {
  /**
   * URL of a bundled woff2 file, by file stem (e.g. "Inter-SemiBold"). Used
   * for faces the page does not already declare with @font-face. Default:
   * this package's fonts/ directory, resolved from import.meta.url (bundlers
   * such as Vite copy the files and rewrite the URLs).
   */
  fontUrl?: (file: string) => string;
  /** Give up after this many milliseconds (default 10,000). */
  timeoutMs?: number;
  /** Reject instead of resolving with a reason when the faces cannot be used. */
  throwOnFailure?: boolean;
  /**
   * The faces to load and measure exactly: face ids ("inter-600") or whole
   * families ("Inter", "IBM Plex Mono"). Default: all seven bundled faces.
   * Text in a face that is not loaded is measured with the table backend's
   * approximations (not reliable), never with the font the browser would
   * substitute. A later call that names more faces loads the missing ones.
   */
  faces?: readonly (FaceId | BundledFamily)[];
}

export interface BrowserFontsResult {
  /** The backend active when the call settles: "canvas" on success. */
  backend: BackendName;
  /** Why the canvas backend was not activated. */
  reason?: string;
}

type Context2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Static URLs so bundlers can see and copy every font file. */
const DEFAULT_URLS: Record<string, () => string> = {
  "Inter-Regular": () => new URL("../fonts/Inter-Regular.woff2", import.meta.url).href,
  "Inter-Medium": () => new URL("../fonts/Inter-Medium.woff2", import.meta.url).href,
  "Inter-SemiBold": () => new URL("../fonts/Inter-SemiBold.woff2", import.meta.url).href,
  "Inter-Bold": () => new URL("../fonts/Inter-Bold.woff2", import.meta.url).href,
  "IBMPlexMono-Regular": () => new URL("../fonts/IBMPlexMono-Regular.woff2", import.meta.url).href,
  "IBMPlexMono-Medium": () => new URL("../fonts/IBMPlexMono-Medium.woff2", import.meta.url).href,
  "IBMPlexMono-SemiBold": () => new URL("../fonts/IBMPlexMono-SemiBold.woff2", import.meta.url).href,
};

/** Probe for the build check: plain ASCII, where the table backend equals HarfBuzz exactly. */
const PROBE_TEXT = "Hamburgefonstiv 0123456789 AVATAR";
const PROBE_SIZE = 100;
/** Canvas letter-spacing that turns ligatures off without changing widths measurably. */
const NO_LIGATURE_SPACING_PX = 0.001;

function familyCss(face: BundledFace): string {
  return /\s/.test(face.family) ? `"${face.family}"` : face.family;
}

function fontString(face: BundledFace, size: number): string {
  return `${face.weight} ${size}px ${familyCss(face)}`;
}

/** The faces an options.faces list names, in BUNDLED_FACES order; all of them when it is omitted. */
function requestedFaces(names: unknown): BundledFace[] {
  if (names === undefined) return [...BUNDLED_FACES];
  if (!Array.isArray(names) || names.length === 0) {
    throw new TypeError(`text-measure: faces must be a non-empty array of face ids or family names, got ${String(names)}`);
  }
  const ids = new Set<FaceId>();
  for (const name of names as unknown[]) {
    const matches = BUNDLED_FACES.filter((face) => face.id === name || face.family === name);
    if (matches.length === 0) {
      const known = [...BUNDLED_FAMILIES, ...BUNDLED_FACES.map((face) => face.id)].map((known) => `"${known}"`).join(", ");
      throw new TypeError(`text-measure: unknown face ${typeof name === "string" ? JSON.stringify(name) : String(name)} in faces (expected one of ${known})`);
    }
    for (const face of matches) ids.add(face.id);
  }
  return BUNDLED_FACES.filter((face) => ids.has(face.id));
}

function createContext(): Context2D | null {
  try {
    if (typeof OffscreenCanvas === "function") {
      const ctx = new OffscreenCanvas(1, 1).getContext("2d");
      if (ctx && typeof ctx.measureText === "function") return ctx;
    }
  } catch {
    // fall through to a DOM canvas
  }
  try {
    const ctx = document.createElement("canvas").getContext("2d");
    if (ctx && typeof ctx.measureText === "function") return ctx;
  } catch {
    // no canvas
  }
  return null;
}

/**
 * Chromium's canvas measureText shapes the words between separators
 * separately, so it misses the kerning the DOM applies against spaces (Inter
 * 500-700 kern ", " and ". ") and across zero-width spaces (every Inter
 * weight). Detected rather than assumed, so browsers whose canvas keeps that
 * kerning are not corrected twice. Probes with the heaviest loaded Inter face
 * (it kerns the probe most); without Inter there is nothing to correct (IBM
 * Plex Mono does not kern).
 */
function canvasDropsSpaceKerning(ctx: Context2D, faces: ReadonlySet<FaceId>): boolean {
  const face = BUNDLED_FACES.filter((candidate) => candidate.family === "Inter" && faces.has(candidate.id)).at(-1);
  if (!face) return false;
  const probe = "a. b, c. d, e A​V";
  ctx.font = fontString(face, PROBE_SIZE);
  if ("letterSpacing" in ctx) (ctx as { letterSpacing: string }).letterSpacing = "0px";
  const native = ctx.measureText(probe).width;
  const whole = tableBackend.measureRun(probe, face, PROBE_SIZE, true);
  const kerning = spaceKerningPx(probe, face, PROBE_SIZE);
  return Math.abs(native - (whole - kerning)) < Math.abs(native - whole);
}

/**
 * The canvas backend for the loaded faces: native measureText for those,
 * the table backend for any other face (never the font the browser would
 * substitute for a face it has not loaded).
 */
function canvasBackend(ctx: Context2D, loaded: ReadonlySet<FaceId>): MeasureBackend {
  const exactFaces = loaded.size === BUNDLED_FACES.length ? undefined : loaded;
  const addSpaceKerning = canvasDropsSpaceKerning(ctx, loaded);
  const spacingSupported = "letterSpacing" in ctx;
  let lastFont = "";
  let lastSpacing = "0px";
  return {
    name: "canvas",
    exact: true,
    exactFaces,
    measuresFallback: true,
    measureRun(text, face, size, ligatures) {
      if (exactFaces && !exactFaces.has(face.id)) return tableBackend.measureRun(text, face, size, ligatures);
      const font = fontString(face, size);
      if (font !== lastFont) {
        ctx.font = font;
        lastFont = font;
      }
      const spacing = ligatures || !spacingSupported ? "0px" : `${NO_LIGATURE_SPACING_PX}px`;
      if (spacingSupported && spacing !== lastSpacing) {
        (ctx as { letterSpacing: string }).letterSpacing = spacing;
        lastSpacing = spacing;
      }
      let width = ctx.measureText(text).width;
      if (spacing !== "0px") width -= NO_LIGATURE_SPACING_PX * countSpacingGraphemes(text);
      if (addSpaceKerning) width += spaceKerningPx(text, face, size);
      return width;
    },
  };
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms ${what}`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function loadFace(face: BundledFace, options: UseBrowserFontsOptions, timeoutMs: number): Promise<void> {
  const descriptor = fontString(face, 16);
  // Faces declared by the page (fonts.css) load through the CSS font loading API.
  const declared = await withTimeout(document.fonts.load(descriptor), timeoutMs, `loading ${descriptor}`);
  if (declared.some((fontFace) => fontFace.status === "loaded")) return;
  const url = options.fontUrl ? options.fontUrl(face.file) : DEFAULT_URLS[face.file]!();
  const fontFace = new FontFace(face.family, `url("${url}") format("woff2")`, { weight: String(face.weight), style: "normal" });
  document.fonts.add(fontFace);
  await withTimeout(fontFace.load(), timeoutMs, `loading ${url}`);
}

/** Native widths must match the bundled build: a different Inter on the page cannot be guaranteed. */
function verifyBuild(ctx: Context2D, faces: readonly BundledFace[]): string | null {
  for (const face of faces) {
    if (!document.fonts.check(fontString(face, 16))) return `${face.family} ${face.weight} is not available after loading`;
    ctx.font = fontString(face, PROBE_SIZE);
    if ("letterSpacing" in ctx) (ctx as { letterSpacing: string }).letterSpacing = "0px";
    const native = ctx.measureText(PROBE_TEXT).width;
    const expected = tableBackend.measureRun(PROBE_TEXT, face, PROBE_SIZE, true);
    if (Math.abs(native - expected) > Math.max(0.25, expected * 0.0025)) {
      return `${face.family} ${face.weight} measures ${native.toFixed(2)}px for the probe, expected ${expected.toFixed(2)}px: the page's "${face.family}" is not the bundled build`;
    }
  }
  return null;
}

/** Faces loaded and verified on this page. */
const verified = new Set<FaceId>();
/** The canvas backend for `verified`; replaced (a new object) whenever a call adds faces. */
let canvas: MeasureBackend | null = null;
/** Face loads in flight or done, shared by concurrent calls; a failed load is dropped so a later call retries. */
const faceLoads = new Map<FaceId, Promise<void>>();

function loadShared(face: BundledFace, options: UseBrowserFontsOptions, timeoutMs: number): Promise<void> {
  let promise = faceLoads.get(face.id);
  if (!promise) {
    const started = loadFace(face, options, timeoutMs).catch((error: unknown) => {
      if (faceLoads.get(face.id) === started) faceLoads.delete(face.id);
      throw error;
    });
    faceLoads.set(face.id, started);
    promise = started;
  }
  return promise;
}

/** The canvas backend covering `faces` (and every face loaded before), or why it cannot be used. */
async function load(faces: readonly BundledFace[], options: UseBrowserFontsOptions): Promise<MeasureBackend | string> {
  if (typeof document === "undefined" || typeof FontFace === "undefined" || !document.fonts || typeof document.fonts.load !== "function") {
    return "no CSS font loading API (document.fonts / FontFace): not a browser";
  }
  const missing = faces.filter((face) => !verified.has(face.id));
  if (missing.length === 0 && canvas) return canvas;
  const ctx = createContext();
  if (!ctx) return "no canvas 2D context to measure with";
  const timeoutMs = options.timeoutMs ?? 10_000;
  try {
    await Promise.all(missing.map((face) => loadShared(face, options, timeoutMs)));
  } catch (error) {
    return `font loading failed: ${error instanceof Error ? error.message : String(error)}`;
  }
  const mismatch = verifyBuild(ctx, missing);
  if (mismatch) return mismatch;
  let added = false;
  for (const face of missing) {
    if (verified.has(face.id)) continue;
    verified.add(face.id);
    added = true;
  }
  // A new object for a grown set, so the switch flushes cached widths and notifies listeners.
  if (added || !canvas) canvas = canvasBackend(ctx, new Set(verified));
  return canvas;
}

/**
 * Loads the bundled faces (all, or `options.faces`) and switches to the
 * canvas backend for them. Resolves with `{ backend: "canvas" }`, or with the
 * still-active backend and a `reason` when the faces cannot be used (no DOM,
 * load failure, timeout, a different build shadowing the family). Pass
 * `throwOnFailure` to reject instead. Concurrent calls share the loads of the
 * faces they have in common; after a failure a later call retries. A call
 * whose faces are all loaded already changes nothing; one that adds faces
 * switches to a new canvas backend covering every loaded face. The last
 * backend request wins: a useTableBackend() or useHarfBuzz() call made while
 * the fonts load takes precedence, unless it fails.
 */
export async function useBrowserFonts(options: UseBrowserFontsOptions = {}): Promise<BrowserFontsResult> {
  const faces = requestedFaces(options.faces);
  const request = requestBackend();
  let result: MeasureBackend | string;
  try {
    result = await load(faces, options);
  } catch (error) {
    request.fail();
    throw error;
  }
  if (typeof result === "string") {
    request.fail();
    if (options.throwOnFailure) throw new Error(`text-measure: ${result}`);
    return { backend: activeBackend().name, reason: result };
  }
  request.complete(result);
  const outcome = await request.decided;
  return { backend: outcome === "applied" ? "canvas" : activeBackend().name };
}
