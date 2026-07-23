/**
 * The always-on layout-lint registry.
 *
 * A lint here only claims "a reader physically cannot read something,"
 * measured on real geometry — never taste. Composition and craft belong to
 * the agent's renders and the style topics.
 *
 * The diagnostics runner calls each lint's `check` in this order and then
 * floats error-severity findings ahead of warnings when assigning ids, so
 * registry order drives id stability. The commit gate blocks on error-tier
 * findings only.
 */
import type { LayoutRule } from "./types";

import { rule as coveredContent } from "./rules/covered-content";
import { rule as containment } from "./rules/containment";
import { rule as brokenEdges } from "./rules/broken-edges";
import { rule as unreadableLabels } from "./rules/unreadable-labels";

export const LAYOUT_RULES: readonly LayoutRule[] = [
  coveredContent,
  containment,
  brokenEdges,
  unreadableLabels,
];

export type { Diagnostic, LayoutRule, Severity } from "./types";
