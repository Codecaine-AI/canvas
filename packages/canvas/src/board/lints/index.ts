/**
 * The always-on and finishing layout-lint registries.
 *
 * LAYOUT_RULES runs on every edit and at spawn. FINISHING_RULES is what the
 * finalize gate runs; it adds the check a board only meets once it is whole
 * (board-too-large: the whole board's extent within the judge view's cap).
 *
 * Every rule reports a visible defect on rendered geometry: content covering
 * content, a broken or box-crossing wire, text its box clips, a child outside
 * its section, a board past the judge view's cap. Spacing, wording, wire
 * length and crossings are layout numbers (canvas_check prints them), not
 * findings.
 *
 * The diagnostics runner calls each registry's lints in order and then floats
 * error-severity findings ahead of warnings when assigning ids, so registry
 * order drives id stability. The commit gate blocks on every scoped finding.
 */
import type { LayoutRule } from "./types";

import { rule as coveredContent } from "./rules/covered-content";
import { rule as containment } from "./rules/containment";
import { rule as brokenEdges } from "./rules/broken-edges";
import { rule as clippedText } from "./rules/clipped-text";
import { rule as boardTooLarge } from "./rules/board-too-large";

export const LAYOUT_RULES: readonly LayoutRule[] = [
  coveredContent,
  containment,
  brokenEdges,
  clippedText,
];

export const FINISHING_RULES: readonly LayoutRule[] = [...LAYOUT_RULES, boardTooLarge];

export type { Diagnostic, LayoutRule, LintContext, Severity } from "./types";
