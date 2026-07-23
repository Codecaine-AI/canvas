/**
 * Style topic: the 16px grid.
 */
import type { StyleTopic } from "./types";

const PROSE = `Everything sits on the 16px grid.

- Positions, widths, heights, and the pitch between things: all multiples of 16.
- Offsets finer than 16px are authoring noise, never intent — the reference boards land
  on-grid, and the misses are hand-drag noise.
- The board snaps patched geometry to the grid anyway, so off-grid arithmetic just
  produces surprises; do the math in grid units from the start.

Deviate only when something real (a label that needs the room, a lattice route) demands
it. A default, not a law.`;

export const style: StyleTopic = {
  id: "grid-discipline",
  title: "Grid discipline (16px)",
  prose: PROSE,
};
