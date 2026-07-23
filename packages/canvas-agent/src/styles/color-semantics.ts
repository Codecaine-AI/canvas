/**
 * Style topic: Ford's color philosophy.
 * Mined from src/rules/color-contrast.ts guidance and the Round-1
 * calibration note (v4r1-org-tree S4: monotone-by-request is not monotony —
 * respect a user-stated palette).
 */
import type { StyleTopic } from "./types";

export const style: StyleTopic = {
  id: "color-semantics",
  title: "Color semantics",
  prose: [
    "Color is a channel: give sibling sections distinct tints so the regions read apart, and",
    "make children contrast their parent — never green on green; nodes sitting on a tinted",
    "section usually read best white or in a clearly different hue. Reserve the semantic",
    "colors (red for failure/error paths, green for success/terminal-good) so they keep their",
    "meaning, and vary within the 10-color roster rather than defaulting everything gray.",
    "A section where one hue dominates by accident says nothing; let color mean something —",
    "color-code flows by meaning, and keep that coding consistent across the board.",
    "But respect a stated palette: when the user asks for gray teams under blue leadership,",
    "monotone is the semantics, not a defect — vary color only where the instruction leaves",
    "the choice to you. A default, not a law.",
  ].join("\n"),
};
