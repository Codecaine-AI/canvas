/**
 * Style topic: Ford's color philosophy.
 */
import type { StyleTopic } from "./types";

const PROSE = `Color is a channel — let it mean something.

- Give sibling sections distinct tints so the regions read apart, and make children
  contrast their parent: never green on green; nodes on a tinted section usually read
  best white or in a clearly different hue.
- Reserve the semantic colors — red for failure/error paths, green for
  success/terminal-good — so they keep their meaning.
- Vary within the 10-color roster rather than defaulting everything gray. A board where
  one hue dominates by accident says nothing; color-code flows by meaning and keep the
  coding consistent across the board.
- Respect a stated palette: when the user asks for gray teams under blue leadership,
  monotone IS the semantics, not a defect — vary color only where the instruction leaves
  the choice to you.

A default, not a law.`;

export const style: StyleTopic = {
  id: "color-semantics",
  title: "Color semantics",
  prose: PROSE,
};
