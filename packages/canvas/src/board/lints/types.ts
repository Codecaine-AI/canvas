/**
 * Layout rule contracts over the real interactive canvas document. Checks
 * produce measured diagnostics; `suggestion` is the prose remedy carried to
 * the model; `guidance` is the rule's own plain statement of what it enforces
 * and how to fix it (documentation — not injected into the model's context).
 */
import type { InteractiveCanvasDocument } from "../../state/schema";
import type { CanvasStyle } from "../../theme/canvas-style";
import type { DetailVerdict } from "../detail-value";

/**
 * `error` findings block a committed finalize in the edited scope. A
 * `warning` never blocks: it rides along in the proposal. A `note` never
 * blocks either: it says what cannot be promised — text
 * within a pixel of its box edge (it may wrap or clip in the browser), or
 * text the bundled fonts cannot measure exactly.
 */
export type Severity = "error" | "warning" | "note";

export interface Diagnostic {
  id: string;            // assigned by the runner: E1.., W1.. — stable within a session turn set
  rule: string;          // rule id
  severity: Severity;
  at: string[];          // object/edge ids involved
  where?: { x: number; y: number; width: number; height: number };  // croppable region
  message: string;       // one line: measured fact + location, e.g. `gap Idle↔Connecting 117px`
  suggestion?: string;   // e.g. `nearest rungs 96 / 128`
}

/**
 * What a rule may know beyond the document: the workspace canvas style, for
 * the rules whose verdict depends on painted border or chip geometry (a
 * section title chip's width includes its border). Absent means the defaults.
 */
export interface LintContext {
  canvasStyle?: CanvasStyle;
  /**
   * Jev's verdicts on node details, keyed by `detailKey`, as canvas_check
   * last judged them (board/detail-value). Absent or empty: the
   * detail-value rule reports nothing.
   */
  detailVerdicts?: ReadonlyMap<string, DetailVerdict>;
}

export interface LayoutRule {
  id: string; title: string; tier: Exclude<Severity, "note">;
  guidance: string;      // the rule stated in prose: what fires, why, how to fix (multi-line GUIDANCE const)
  check(document: InteractiveCanvasDocument, context?: LintContext): Omit<Diagnostic, "id">[];
}
