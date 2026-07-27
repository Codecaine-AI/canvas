/**
 * The always-on and finishing layout-lint registries.
 *
 * LAYOUT_RULES runs on every edit and at spawn. FINISHING_RULES is what the
 * finalize gate runs; it adds polish-tier checks that would only nag while a
 * region is still being built.
 *
 * An always-on lint here only claims "a reader physically cannot read
 * something," measured on real geometry — never taste. Composition and craft
 * belong to the agent's renders and the style topics.
 *
 * The diagnostics runner calls each registry's lints in order and then floats
 * error-severity findings ahead of warnings when assigning ids, so registry
 * order drives id stability. The commit gate blocks on error-tier findings
 * only.
 */
import type { LayoutRule } from "./types";

import { rule as coveredContent } from "./rules/covered-content";
import { rule as containment } from "./rules/containment";
import { rule as brokenEdges } from "./rules/broken-edges";
import { rule as unreadableLabels } from "./rules/unreadable-labels";
import { rule as crowding } from "./rules/crowding";
import { rule as frameSlack } from "./rules/frame-slack";

export const LAYOUT_RULES: readonly LayoutRule[] = [
  coveredContent,
  containment,
  brokenEdges,
  unreadableLabels,
  crowding,
];

export const FINISHING_RULES: readonly LayoutRule[] = [...LAYOUT_RULES, frameSlack];

export type { Diagnostic, LayoutRule, Severity } from "./types";
