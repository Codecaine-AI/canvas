/**
 * Diagnostics runner — canvas document → Diagnostic[] via the lint
 * registry (./index LAYOUT_RULES), plus the DIAGNOSTICS text block. Called
 * per operation, at spawn (<board_state>), and as the committed-finalize gate
 * (./index FINISHING_RULES).
 *
 * One diagnostic renders as one line — the measured fact plus its prose
 * remedy — and the model chooses and encodes the fix.
 *
 * Id assignment is stable: errors first as E1..En, then warnings as W1..Wn,
 * in registry-rule order then the order the rule's positional scan emitted.
 * Re-running on an unchanged board yields identical ids; ids reset whenever
 * the draft changes and the model tracks them turn to turn.
 */
import { LAYOUT_RULES } from "./index";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";
import type { Diagnostic, LayoutRule, LintContext } from "./types";

/**
 * `context` carries the workspace canvas style for the rules that measure
 * painted borders or chips; a session passes its own (`session.canvasStyle`).
 */
export function runDiagnostics(
  document: InteractiveCanvasDocument,
  rules: readonly LayoutRule[] = LAYOUT_RULES,
  context: LintContext = {},
): Diagnostic[] {
  const collected: Omit<Diagnostic, "id">[] = [];
  for (const rule of rules) {
    for (const finding of rule.check(document, context)) {
      collected.push(finding);
    }
  }
  const assign = (
    entries: typeof collected,
    prefix: "E" | "W",
  ): Diagnostic[] => entries.map((finding, index) => ({
    ...finding,
    id: `${prefix}${index + 1}`,
  }));
  return [
    ...assign(collected.filter((finding) => finding.severity === "error"), "E"),
    ...assign(collected.filter((finding) => finding.severity === "warning"), "W"),
  ];
}

/**
 * `runDiagnostics` over a layout session's draft, measured with the session's
 * workspace canvas style. Every session-side caller goes through here so no
 * lint pass forgets the style.
 */
export function sessionDiagnostics(
  session: { readonly draft: InteractiveCanvasDocument; readonly canvasStyle?: LintContext["canvasStyle"] },
  rules: readonly LayoutRule[] = LAYOUT_RULES,
): Diagnostic[] {
  return runDiagnostics(session.draft, rules, { canvasStyle: session.canvasStyle });
}

/**
 * One diagnostic renders as one line — the measured fact plus its prose
 * remedy. The model chooses and encodes the fix.
 */
export function diagnosticLines(diagnostic: Diagnostic): string[] {
  const suggestion = diagnostic.suggestion ? ` (${diagnostic.suggestion})` : "";
  return [`${diagnostic.id} ${diagnostic.rule}: ${diagnostic.message}${suggestion}`];
}

export function formatDiagnostics(diags: Diagnostic[]): string {
  const errors = diags.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diags.length - errors;
  if (diags.length === 0) return "DIAGNOSTICS · clean";
  const lines = [
    `DIAGNOSTICS · ${errors} error${errors === 1 ? "" : "s"} · ${warnings} warning${warnings === 1 ? "" : "s"}`,
  ];
  for (const diagnostic of diags) {
    lines.push(...diagnosticLines(diagnostic).map((line) => `  ${line}`));
  }
  return lines.join("\n");
}
