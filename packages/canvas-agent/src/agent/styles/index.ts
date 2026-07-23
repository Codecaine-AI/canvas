/**
 * The style registry: every style topic is a file in this directory, and
 * ALL of them are injected into the session context by the style-guide
 * loader — no pull tool. Order here is the order the topics appear in the
 * <style_guide> block.
 *
 * Style topics are craft prose only — they never produce diagnostics; the
 * lint registry owns that surface.
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
