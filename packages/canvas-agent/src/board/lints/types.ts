/**
 * Layout rule contracts over the real interactive canvas document. Checks
 * produce measured diagnostics; quickfixes are opt-in operations invoked
 * through apply_quickfix; `guidance` is the rule's own plain statement of
 * what it enforces and how to fix it (documentation — not injected into the
 * model's context).
 */
import type { AgentPatchOperation } from "../../protocol";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

export type Severity = "error" | "warning";

export interface Diagnostic {
  id: string;            // assigned by the runner: E1.., W1.. — stable within a session turn set
  rule: string;          // rule id
  severity: Severity;
  at: string[];          // object/edge ids involved
  where?: { x: number; y: number; width: number; height: number };  // croppable region
  message: string;       // one line: measured fact + location, e.g. `gap Idle↔Connecting 117px`
  suggestion?: string;   // e.g. `nearest rungs 96 / 128`
  quickfixAvailable: boolean;
}

export interface LayoutRule {
  id: string; title: string; tier: Severity;
  guidance: string;      // the rule stated in prose: what fires, why, how to fix (multi-line GUIDANCE const)
  check(document: InteractiveCanvasDocument): Omit<Diagnostic, "id" | "quickfixAvailable">[];
  quickfix?(document: InteractiveCanvasDocument, d: Diagnostic): AgentPatchOperation[];  // ops to fix THIS finding
}
