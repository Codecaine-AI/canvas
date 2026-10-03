/**
 * @codecaine-ai/text-measure: measure, wrap and fit text the way the browser
 * paints it, without rendering. Synchronous, runs anywhere (no WASM, no
 * node:* imports). The default backend is the generated advance table;
 * `useHarfBuzz()` (./headless) and `useBrowserFonts()` (./browser) switch to
 * an exact backend. See README.md for the guarantee and its conditions.
 */

import { defaultBackend, setBackend } from "./backend.ts";
import "./table-backend.ts"; // registers the table backend

export type {
  ActiveBackend,
  BackendName,
  FitBox,
  FitOptions,
  FitResult,
  FitVerdict,
  FontSpec,
  RunFragment,
  RunsLine,
  RunsWrapResult,
  TextLine,
  TextRun,
  UnreliableReason,
  WrapOptions,
  WrapResult,
} from "./types.ts";
export type { BundledFace, BundledFamily, FaceId } from "./faces.ts";
export { BUNDLED_FACES } from "./faces.ts";
export { fitText, measureWidth, uncoveredChars, wrapText } from "./measure.ts";
export { wrapRuns } from "./runs.ts";
export { fontToCss } from "./font.ts";
export { activeBackend, onBackendChange } from "./backend.ts";

/**
 * Switches back to the default table backend (approximate, always available).
 * Hosts rarely need this; tests use it to compare backends. Like every
 * backend request it wins over older requests still loading (an earlier
 * useHarfBuzz() that has not finished), and it applies to every copy of the
 * package in the process.
 */
export function useTableBackend(): void {
  setBackend(defaultBackend());
}
