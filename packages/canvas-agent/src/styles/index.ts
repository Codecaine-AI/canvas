/**
 * The v5 Tier-B style registry (v5-plan.md §1 Tier B, REVISED): every style
 * topic is a file in this directory, and ALL of them are injected into the
 * session context by the styleGuideContext loader
 * (src/harness/loaders/style-guide.ts) — no pull tool. Order here is the
 * order the topics appear in the <style_guide> block.
 *
 * These are the demoted v4 per-turn rules (spacing ladder, grid,
 * section-trim, registers, hub-balance, rhythm, density, color-contrast)
 * rewritten as craft prose, plus the Round-1-mandated new topics
 * (connectors-and-labels, tree-edge-entry, lanes-and-corridors). Style
 * topics never produce diagnostics; the lint surface is src/lints/.
 */
import type { StyleTopic } from "./types";

import { style as spacingAndCorridors } from "./spacing-and-corridors";
import { style as gridDiscipline } from "./grid-discipline";
import { style as sectionFraming } from "./section-framing";
import { style as registersAndRhythm } from "./registers-and-rhythm";
import { style as fanComposition } from "./fan-composition";
import { style as colorSemantics } from "./color-semantics";
import { style as connectorsAndLabels } from "./connectors-and-labels";
import { style as treeEdgeEntry } from "./tree-edge-entry";
import { style as lanesAndCorridors } from "./lanes-and-corridors";

export type { StyleTopic } from "./types";

export const STYLE_TOPICS: readonly StyleTopic[] = [
  spacingAndCorridors,
  gridDiscipline,
  sectionFraming,
  registersAndRhythm,
  fanComposition,
  colorSemantics,
  connectorsAndLabels,
  treeEdgeEntry,
  lanesAndCorridors,
];
