/**
 * The active measuring backend and the one measuring function everything goes
 * through: our API (measureWidth, wrapped line widths) and Pretext (via the
 * context bound in pretext-binding.ts) both call measureRunPx().
 *
 * Which backend is active is process-wide state, shared by every copy of
 * this package in the process (see Registry below).
 */

import { BUNDLED_FACES, type BundledFace, type FaceId } from "./faces.ts";
import { isInvisibleGrapheme, isSimpleCoveredRun, isUncoveredGrapheme } from "./coverage.ts";
import { graphemes, isControl, isEmojiGrapheme, isWideGrapheme } from "./text.ts";
import { FACE_TABLES } from "./generated/tables.ts";
import type { ActiveBackend, BackendName } from "./types.ts";

/**
 * A measuring backend. Backends are shared by every copy of the package in
 * the process, so measureRun gets other copies' BundledFace objects: it must
 * rely only on face.id, family, weight and file, never on object identity.
 */
export interface MeasureBackend {
  readonly name: BackendName;
  /** Widths match the browser for covered text (in the faces of `exactFaces`). */
  readonly exact: boolean;
  /**
   * The faces measured exactly; undefined means every bundled face. Text in
   * any other face is measured like the table backend (approximate): only
   * covered runs reach measureRun, uncovered graphemes are estimated.
   */
  readonly exactFaces?: ReadonlySet<FaceId>;
  /**
   * True when the backend measures text the bundled face cannot paint itself
   * (a native canvas falls back to system fonts exactly like the DOM does),
   * for the faces of `exactFaces`. Otherwise uncovered graphemes are
   * estimated and never reach the backend.
   */
  readonly measuresFallback: boolean;
  /**
   * Width in px of `text` shaped as one run in `face` at `size` px, without
   * letter-spacing. `ligatures: false` mirrors CSS letter-spacing != 0. Unless
   * the backend measures fallback for `face`, `text` contains only graphemes
   * the face covers.
   */
  measureRun(text: string, face: BundledFace, size: number, ligatures: boolean): number;
}

/** How a backend request was decided. */
export type RequestOutcome = "applied" | "superseded" | "withdrawn";

/** One useTableBackend() / useHarfBuzz() / useBrowserFonts() call, kept in the registry until decided. */
interface BackendRequest {
  /** The backend the request asks for once it has completed; null while it loads. */
  backend: MeasureBackend | null;
  /** Called exactly once, when the request leaves the queue. */
  readonly settle: (outcome: RequestOutcome) => void;
}

/**
 * Process-wide backend state: one object on globalThis, shared by every copy
 * of this package in the process. A host can load the core entry from its own
 * bundle (with its own Pretext inlined) and the headless entry from
 * node_modules: two copies, and HarfBuzz loaded by one must be the backend of
 * both. Every copy runs its own functions against this object, so it holds
 * only data and plain callbacks.
 *
 * Version rule: the key names the registry version. Bump it (registry@2)
 * whenever the MeasureBackend interface or the shape or meaning of this
 * object, including how requests are decided, changes incompatibly. Copies
 * with different versions then keep separate registries (each measures with
 * its own backend) instead of misreading each other's state.
 */
interface Registry {
  /** The backend every copy measures with; null until a table backend registers. */
  active: MeasureBackend | null;
  /** The canonical table backend: the first copy to load registers its own, and useTableBackend() in every copy switches to it. */
  table: MeasureBackend | null;
  /** Completed switches. */
  switches: number;
  /** Requests not decided yet, oldest first. A failed request has withdrawn itself. */
  requests: BackendRequest[];
  /** onBackendChange listeners of every copy. */
  readonly listeners: Set<() => void>;
  /** Run before the listeners on every switch: each copy's Pretext binding flushes its Pretext caches. */
  readonly hooks: Set<() => void>;
}

const REGISTRY_KEY = Symbol.for("@codecaine-ai/text-measure/registry@1");

function openRegistry(): Registry {
  const existing = (globalThis as unknown as Record<symbol, Registry | undefined>)[REGISTRY_KEY];
  if (existing) return existing;
  const registry: Registry = { active: null, table: null, switches: 0, requests: [], listeners: new Set(), hooks: new Set() };
  try {
    Object.defineProperty(globalThis, REGISTRY_KEY, { value: registry, configurable: true, enumerable: false, writable: false });
  } catch {
    // A frozen globalThis: this copy keeps its own backend state.
  }
  return registry;
}

const registry = openRegistry();

/**
 * Registers the default (table) backend; the table backend registers itself
 * at import. The first copy in the process wins: later copies switch to its
 * table backend, so table -> table across copies is a no-op.
 */
export function registerDefaultBackend(backend: MeasureBackend): void {
  registry.table ??= backend;
  registry.active ??= registry.table;
}

/** The process's table backend (the one useTableBackend() switches to). */
export function defaultBackend(): MeasureBackend {
  if (!registry.table) throw new Error("text-measure: no measuring backend registered");
  return registry.table;
}

export function getBackend(): MeasureBackend {
  if (!registry.active) throw new Error("text-measure: no measuring backend registered");
  return registry.active;
}

/**
 * Internal: `hook` runs before the listeners on every backend switch made by
 * any copy (the Pretext binding flushes its caches). Returns an unregister function.
 */
export function onBackendSwitchInternal(hook: () => void): () => void {
  registry.hooks.add(hook);
  return () => {
    registry.hooks.delete(hook);
  };
}

/** Calls `fn`; an exception is reported and swallowed so a switch always completes. */
function callSafely(fn: () => void, message: string): void {
  try {
    fn();
  } catch (error) {
    try {
      console.error(message, error);
    } catch {
      // Nothing left to report with.
    }
  }
}

/** Makes `backend` active: flushes cached widths (hooks), then notifies listeners. No-op when already active. */
function switchTo(backend: MeasureBackend): void {
  if (registry.active === backend) return;
  registry.active = backend;
  registry.switches++;
  for (const hook of [...registry.hooks]) callSafely(hook, "text-measure: a backend switch hook threw");
  for (const listener of [...registry.listeners]) callSafely(listener, "text-measure: an onBackendChange listener threw");
}

/**
 * The newest request decides: once it has completed, its backend becomes
 * active and every older request loses; while it is still loading, older
 * completed requests wait (they win if it fails).
 */
function decide(): void {
  const newest = registry.requests.at(-1);
  if (!newest?.backend) return;
  const decided = registry.requests;
  registry.requests = [];
  switchTo(newest.backend);
  for (const request of decided) request.settle(request === newest ? "applied" : "superseded");
}

export interface BackendRequestHandle {
  /** Records the backend this request asks for (its load finished); the newest completed request is applied. */
  complete(backend: MeasureBackend): void;
  /** Withdraws the request (its load failed): the request before it decides again. */
  fail(): void;
  /** Settles once the request is decided: applied, superseded by a newer request, or withdrawn. */
  readonly decided: Promise<RequestOutcome>;
}

/**
 * Opens a backend request. useTableBackend(), useHarfBuzz() and
 * useBrowserFonts() each make one, in any copy of the package; the last
 * request wins, whatever order the loads finish in. Call complete() or
 * fail() exactly once.
 */
export function requestBackend(): BackendRequestHandle {
  let settle!: (outcome: RequestOutcome) => void;
  const decided = new Promise<RequestOutcome>((resolve) => {
    settle = resolve;
  });
  const request: BackendRequest = { backend: null, settle };
  registry.requests.push(request);
  return {
    decided,
    complete(backend) {
      if (request.backend || !registry.requests.includes(request)) return;
      request.backend = backend;
      decide();
    },
    fail() {
      const index = registry.requests.indexOf(request);
      if (index < 0) return;
      registry.requests.splice(index, 1);
      settle("withdrawn");
      decide();
    },
  };
}

/**
 * Makes `backend` the active one now, as the newest request: older requests
 * still loading lose. Flushes Pretext's cached widths (each backend keeps its
 * own cache) and notifies onBackendChange listeners; no-op when already active.
 */
export function setBackend(backend: MeasureBackend): void {
  requestBackend().complete(backend);
}

/** Backend switches so far in the process (every copy). */
export function backendSwitches(): number {
  return registry.switches;
}

export function activeBackend(): ActiveBackend {
  const backend = getBackend();
  const info: ActiveBackend = { name: backend.name, exact: backend.exact };
  const exactFaces = backend.exactFaces;
  if (exactFaces) info.faces = BUNDLED_FACES.filter((face) => exactFaces.has(face.id)).map((face) => face.id);
  return info;
}

/** True when the active backend measures `face` exactly (an exact backend that loaded this face). */
export function isExactFor(face: BundledFace): boolean {
  const backend = getBackend();
  return backend.exact && (backend.exactFaces === undefined || backend.exactFaces.has(face.id));
}

/**
 * Calls `listener` after every backend switch (fonts loaded, HarfBuzz ready),
 * whichever copy of the package made it. A listener that throws is reported
 * with console.error and does not stop the others. Returns an unsubscribe function.
 */
export function onBackendChange(listener: () => void): () => void {
  registry.listeners.add(listener);
  return () => {
    registry.listeners.delete(listener);
  };
}

/**
 * Advance of an emoji-presentation cluster in Chromium on macOS (Apple Color
 * Emoji), in px, at integer font sizes 8..24 (Chromium 153): bitmap strikes
 * make it 1.25-1.3em up to 16px, shrinking to 1em at 24px and above. Other
 * platforms' emoji fonts differ (Noto Color Emoji, Segoe UI Emoji); emoji are
 * never reliable, the estimate only reserves room.
 */
const EMOJI_PX: Readonly<Record<number, number>> = {
  8: 10, 9: 12, 10: 13, 11: 14, 12: 15, 13: 16, 14: 18, 15: 19, 16: 20,
  17: 21, 18: 21, 19: 22, 20: 22, 21: 23, 22: 23, 23: 24, 24: 24,
};

/** Estimated emoji advance at `size` px: the table above, interpolated between integer sizes; 1.25em below 8px, 1em from 24px. */
export function emojiAdvancePx(size: number): number {
  if (size >= 24) return size;
  if (size < 8) return size * 1.25;
  const low = Math.floor(size);
  const a = EMOJI_PX[low]!;
  const b = EMOJI_PX[Math.min(24, low + 1)]!;
  return a + (b - a) * (size - low);
}

/**
 * Width a browser gives a grapheme the bundled face lacks, which depends on
 * the machine's fallback fonts: emoji per emojiAdvancePx, 1em for CJK, Hangul
 * and fullwidth forms, the face's average letter advance otherwise. With
 * `forPretext` emoji stay at 1em: Pretext probes the DOM when an emoji
 * measures wider than 1em + 0.5px (a fake DOM such as happy-dom would report 0
 * and corrupt every emoji width), and our own width pass replaces those
 * segment widths afterwards anyway.
 */
export function estimateGraphemePx(grapheme: string, face: BundledFace, size: number, forPretext = false): number {
  if (isEmojiGrapheme(grapheme)) return forPretext ? size : emojiAdvancePx(size);
  if (isWideGrapheme(grapheme)) return size;
  const table = FACE_TABLES[face.id];
  return (table.averageAdvance / table.unitsPerEm) * size;
}

/**
 * Width in px of `text` as one line in `face`: covered stretches are shaped as
 * runs by the active backend (a fallback font starts a new run in the browser
 * too, so no kerning crosses it), uncovered graphemes are estimated, controls
 * and lone format characters are zero.
 */
export function measureRunPx(text: string, face: BundledFace, size: number, ligatures: boolean, forPretext = false): number {
  const backend = getBackend();
  if (text === "") return 0;
  if (backend.measuresFallback && (backend.exactFaces === undefined || backend.exactFaces.has(face.id))) {
    let clean = text;
    for (let i = 0; i < text.length; i++) {
      if (isControl(text.charCodeAt(i))) {
        clean = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, "");
        break;
      }
    }
    return clean === "" ? 0 : backend.measureRun(clean, face, size, ligatures);
  }
  if (isSimpleCoveredRun(text, face)) return backend.measureRun(text, face, size, ligatures);
  let total = 0;
  let run = "";
  for (const grapheme of graphemes(text)) {
    if (isInvisibleGrapheme(grapheme)) {
      // Zero width; a format character inside a run stays in it (HarfBuzz hides it).
      if (run !== "" && !/[\u0000-\u001f\u007f-\u009f]/.test(grapheme)) run += grapheme;
      continue;
    }
    if (isUncoveredGrapheme(grapheme, face)) {
      if (run !== "") total += backend.measureRun(run, face, size, ligatures);
      run = "";
      total += estimateGraphemePx(grapheme, face, size, forPretext);
      continue;
    }
    run += grapheme;
  }
  if (run !== "") total += backend.measureRun(run, face, size, ligatures);
  return total;
}
