/**
 * The always-on and finishing layout-lint registries.
 *
 * LAYOUT_RULES runs on every edit and at spawn. FINISHING_RULES is what the
 * finalize gate runs; today it is the same set. The board's size is not a
 * finding: the eval harness (`climb render`) reports its long edge.
 *
 * Every rule reports a visible defect on rendered geometry: content covering
 * content, a broken or box-crossing wire, text its box clips, a child outside
 * its section. Spacing, wording, wire
 * length and crossings are layout numbers (canvas_check prints them), not
 * findings.
 *
 * The diagnostics runner calls each registry's lints in order and then floats
 * error-severity findings ahead of warnings when assigning ids, so registry
 * order drives id stability. The commit gate blocks on every scoped error.
 */
import type { LayoutRule } from "./types";

import { rule as coveredContent } from "./rules/covered-content";
import { rule as containment } from "./rules/containment";
import { rule as brokenEdges } from "./rules/broken-edges";
import { rule as clippedText } from "./rules/clipped-text";

export const LAYOUT_RULES: readonly LayoutRule[] = [
  coveredContent,
  containment,
  brokenEdges,
  clippedText,
];

export const FINISHING_RULES: readonly LayoutRule[] = [...LAYOUT_RULES];

export type { Diagnostic, LayoutRule, LintContext, Severity } from "./types";
