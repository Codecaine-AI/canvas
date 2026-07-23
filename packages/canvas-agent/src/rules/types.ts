/**
 * Layout rule contracts (v4 diagnostic layout, Phase 1) — FROZEN by
 * v4-build-spec.md; Phase-2 rule agents code against these sight-unseen.
 *
 * One rule, one file, two faces: `guidance` is assembled into the system
 * prompt (defaults-not-laws voice), `check` produces measured, located
 * diagnostics the model resolves as it sees fit, and `quickfix` is an
 * opt-in offer the model invokes via apply_quickfix — never automatic.
 */
import type { AgentPatchOperation } from "../protocol";
import type { BoardModel } from "../digest/board-model";

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
  guidance: string;      // prose for the prompt; defaults-not-laws voice; 3-8 lines
  check(board: BoardModel): Omit<Diagnostic, "id" | "quickfixAvailable">[];
  quickfix?(board: BoardModel, d: Diagnostic): AgentPatchOperation[];  // ops to fix THIS finding
}
