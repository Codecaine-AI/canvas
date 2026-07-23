/**
 * Style topic: shared centerlines and even pitch.
 */
import type { StyleTopic } from "./types";

const PROSE = `Peers share a centerline; runs keep one pitch.

- Peers read as peers when they share one register — even across section boundaries,
  which nesting alone can never say. Exact alignment is the norm; a few pixels off reads
  as a mistake, not a choice.
- When centers crowd within 8px of a shared register, either align them exactly (the
  members' median center is the usual register) or separate them clearly. Pitch along a
  register runs 192–320 between chip-sized members.
- Siblings in a row or column keep one pitch: even gaps drawn from the ladder, flush (0)
  only for repeated cells.
- Judge evenness within a gap-class — gutters against gutters, intra-cluster gaps against
  intra-cluster gaps. 32px inside clusters and 128px between them is the grouping device
  itself; a 96px spread among the gutters alone (192/288/288) reads as accidental. Keep
  each class steady (the rung nearest the median gap is the usual pick), or break the run
  apart visibly so it reads as two groups instead of one bad one.

Defaults, not laws.`;

export const style: StyleTopic = {
  id: "registers-and-rhythm",
  title: "Registers and rhythm",
  prose: PROSE,
};
