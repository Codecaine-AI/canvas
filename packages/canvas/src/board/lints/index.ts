/**
 * The always-on and finishing layout-lint registries.
 *
 * LAYOUT_RULES runs on every edit and at spawn. FINISHING_RULES is what the
 * finalize gate runs; it adds polish-tier checks that would only nag while a
 * region is still being built.
 *
 * Always-on lints check geometry defects and near-touching node boundaries,
 * plus the name + detail text convention (../text-rules): a name that reads
 * as prose, a detail longer than one fact.
 * Crowding's 16px separation floor is a conservative readability heuristic,
 * not proof that every closer pair is unreadable. Actual wire and label
 * obstructions use rendered geometry. Hue and composition belong to visual
 * judgment; categorical same-hue checks are excluded from both registries.
 *
 * The diagnostics runner calls each registry's lints in order and then floats
 * error-severity findings ahead of warnings when assigning ids, so registry
 * order drives id stability. The commit gate blocks on every scoped finding.
 */
import type { LayoutRule } from "./types";

import { rule as coveredContent } from "./rules/covered-content";
import { rule as containment } from "./rules/containment";
import { rule as brokenEdges } from "./rules/broken-edges";
import { rule as unreadableLabels } from "./rules/unreadable-labels";
import { rule as crowding } from "./rules/crowding";
import { rule as clippedText } from "./rules/clipped-text";
import { rule as labelIsProse } from "./rules/label-is-prose";
import { rule as detailTooLong } from "./rules/detail-too-long";
import { rule as frameSlack } from "./rules/frame-slack";

export const LAYOUT_RULES: readonly LayoutRule[] = [
  coveredContent,
  containment,
  brokenEdges,
  unreadableLabels,
  crowding,
  clippedText,
  labelIsProse,
  detailTooLong,
];

export const FINISHING_RULES: readonly LayoutRule[] = [...LAYOUT_RULES, frameSlack];

export type { Diagnostic, LayoutRule, LintContext, Severity } from "./types";
