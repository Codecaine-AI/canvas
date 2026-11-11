/**
 * The always-on and finishing layout-lint registries.
 *
 * LAYOUT_RULES runs on every edit and at spawn. FINISHING_RULES is what the
 * finalize gate and canvas_check run: the layout rules plus the check-only
 * warnings (rules/color.ts, rules/wires.ts, rules/guides.ts), which measure
 * how the finished board reads and would drown every edit's result if they
 * ran there.
 *
 * A layout lint reports only a defect the system cannot prevent: content covering
 * content (covered-content: box on box, section on section). Everything else
 * is structural: the router keeps wires out of boxes and their own captions,
 * the renderer places label chips clear, nodes grow to fit their text,
 * sections grow to hold their children, and edits refuse broken wires.
 * integrity reports what those fixes would have prevented, only where
 * something bypassed them (a Studio edit, an older file, a route with no
 * clear path). Wire length,
 * crossings and label chips that found no clear spot are layout numbers
 * (canvas_check prints them), not findings; the eval harness (`climb
 * render`) reports the board's long edge.
 *
 * The diagnostics runner calls each registry's lints in order and then floats
 * error-severity findings ahead of warnings when assigning ids, so registry
 * order drives id stability. The commit gate blocks on every scoped error.
 */
import type { LayoutRule } from "./types";

import { rule as coveredContent } from "./rules/covered-content";
import { rules as colorRules } from "./rules/color";
import { rule as nearMiss } from "./rules/guides";
import { rule as integrity } from "./rules/integrity";
import { rules as wireRules } from "./rules/wires";

export const LAYOUT_RULES: readonly LayoutRule[] = [coveredContent, integrity];

export const FINISHING_RULES: readonly LayoutRule[] = [...LAYOUT_RULES, ...colorRules, ...wireRules, nearMiss];

export type { Diagnostic, LayoutRule, LintContext, Severity } from "./types";
