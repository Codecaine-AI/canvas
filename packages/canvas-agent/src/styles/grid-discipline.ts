/**
 * Style topic: the 16px grid.
 * Mined from src/rules/grid.ts guidance + rulebook R1.
 */
import type { StyleTopic } from "./types";

export const style: StyleTopic = {
  id: "grid-discipline",
  title: "Grid discipline (16px)",
  prose: [
    "Everything sits on the 16px grid: positions, widths, heights, and the pitch between",
    "things. Offsets finer than 16px are authoring noise, never intent — roughly 88% of the",
    "reference corpus lands exactly on-grid, and the misses are hand-drag noise. Place at",
    "multiples of 16 and size in multiples of 16; the board snaps geometry to the grid anyway,",
    "so off-grid arithmetic just produces surprises. Deviate only when something real (a label",
    "that needs the room, a lattice route) demands it. A default, not a law.",
  ].join("\n"),
};
