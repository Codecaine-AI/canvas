/**
 * The always-on layout-lint registry (v5 Tier A — see
 * docs/agent-eval/2026-07-22-rule-eval/v5-plan.md §1).
 *
 * The flat 12-rule v4 registry is replaced by the five graph lints in
 * src/lints/: objective wreckage only — things getting covered up, broken
 * edges, strangled labels, dead frame. The demoted v4 rules (spacing ladder,
 * grid, section-trim, registers, hub-balance, rhythm, density,
 * color-contrast) remain on disk in src/rules/ but are UNREGISTERED; they
 * become Phase-B style files and Phase D archives the modules.
 *
 * The diagnostics runner (diagnostics/run.ts) calls each lint's `check` in
 * this order and then floats error-severity findings ahead of warnings when
 * assigning ids — so registry order still drives id stability. The commit
 * gate blocks on error-tier findings only, unchanged.
 */
import type { LayoutRule } from "./types";

import { rule as coveredContent } from "../lints/covered-content";
import { rule as containment } from "../lints/containment";
import { rule as brokenEdges } from "../lints/broken-edges";
import { rule as unreadableLabels } from "../lints/unreadable-labels";
import { rule as frameBalance } from "../lints/frame-balance";

export const LAYOUT_RULES: readonly LayoutRule[] = [
  coveredContent,
  containment,
  brokenEdges,
  unreadableLabels,
  frameBalance,
];

export type { Diagnostic, LayoutRule, Severity } from "./types";
