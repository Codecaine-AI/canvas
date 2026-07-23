/**
 * Diagnostics runner (v4 diagnostic layout, Phase 1) — BoardModel →
 * Diagnostic[] via the rules registry, plus the DIAGNOSTICS text block.
 *
 * Id assignment (FROZEN by v4-build-spec.md): errors first as E1..En, then
 * warnings as W1..Wn, in stable (registry-rule order, then the order the
 * rule's check emitted — its positional scan) order. Re-running on an
 * unchanged board yields identical ids; ids reset per run and the model
 * tracks them turn to turn.
 */
import { LAYOUT_RULES } from "../rules";
import type { BoardModel } from "../digest/board-model";
import type { Diagnostic, LayoutRule } from "../rules/types";

export function runDiagnostics(board: BoardModel, rules: readonly LayoutRule[] = LAYOUT_RULES): Diagnostic[] {
  const collected: { finding: Omit<Diagnostic, "id" | "quickfixAvailable">; quickfixAvailable: boolean }[] = [];
  for (const rule of rules) {
    for (const finding of rule.check(board)) {
      collected.push({ finding, quickfixAvailable: typeof rule.quickfix === "function" });
    }
  }
  const assign = (
    entries: typeof collected,
    prefix: "E" | "W",
  ): Diagnostic[] => entries.map((entry, index) => ({
    ...entry.finding,
    id: `${prefix}${index + 1}`,
    quickfixAvailable: entry.quickfixAvailable,
  }));
  return [
    ...assign(collected.filter((entry) => entry.finding.severity === "error"), "E"),
    ...assign(collected.filter((entry) => entry.finding.severity === "warning"), "W"),
  ];
}

export function formatDiagnostics(diags: Diagnostic[]): string {
  const errors = diags.filter((diagnostic) => diagnostic.severity === "error").length;
  const warnings = diags.length - errors;
  if (diags.length === 0) return "DIAGNOSTICS · clean";
  const lines = [
    `DIAGNOSTICS · ${errors} error${errors === 1 ? "" : "s"} · ${warnings} warning${warnings === 1 ? "" : "s"}`,
  ];
  for (const diagnostic of diags) {
    const suggestion = diagnostic.suggestion ? ` (${diagnostic.suggestion})` : "";
    const quickfix = diagnostic.quickfixAvailable ? " [quickfix]" : "";
    lines.push(`  ${diagnostic.id} ${diagnostic.rule}: ${diagnostic.message}${suggestion}${quickfix}`);
  }
  return lines.join("\n");
}
