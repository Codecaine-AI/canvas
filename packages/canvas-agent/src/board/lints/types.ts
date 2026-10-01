/**
 * Layout rule contracts over the real interactive canvas document. Checks
 * produce measured diagnostics; `suggestion` is the prose remedy carried to
 * the model; `guidance` is the rule's own plain statement of what it enforces
 * and how to fix it (documentation — not injected into the model's context).
 */
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import type { CanvasStyle } from "@codecaine-ai/canvas/style";

export type Severity = "error" | "warning";

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
}

export interface LayoutRule {
  id: string; title: string; tier: Severity;
  guidance: string;      // the rule stated in prose: what fires, why, how to fix (multi-line GUIDANCE const)
  check(document: InteractiveCanvasDocument, context?: LintContext): Omit<Diagnostic, "id">[];
}
