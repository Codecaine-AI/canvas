/**
 * The board lints: the layout rules every canvas edit and check runs, and the
 * runner that turns a document into numbered findings. Another host runs them
 * with `runDiagnostics(document, FINISHING_RULES)` and no agent package.
 */
export { FINISHING_RULES, LAYOUT_RULES } from "./board/lints/index";
export { FIT_VIEW_PX, boardEdgeCapPx } from "./board/lints/rules/board-too-large";
export {
  blockingDiagnostics,
  diagnosticLines,
  formatDiagnostics,
  runDiagnostics,
  sessionDiagnostics,
  sessionLintContext,
  type LintSession,
} from "./board/lints/run";
export type { Diagnostic, LayoutRule, LintContext, Severity } from "./board/lints/types";
