/**
 * The style registry: every style topic is a file in this directory, and
 * ALL of them are injected into the session context by the style-guide
 * loader — no pull tool. Order here is the order the topics appear in the
 * <style_guide> block.
 *
 * Style topics are craft prose only — they never produce diagnostics; the
 * lint registry owns that surface.
 * The registry also carries the craft targets, the structured dimensions the
 * style guide renders beside the prose topics.
 */
import type { StyleTopic } from "./types";

import { style as aesthetic } from "./aesthetic";

export { CRAFT_TARGETS } from "./craft-targets";
export type { CraftTargets } from "./types";
export type { StyleTopic } from "./types";

export const STYLE_TOPICS: readonly StyleTopic[] = [
  aesthetic,
];
