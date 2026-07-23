/**
 * Style topic: shared centerlines and even pitch.
 * Mined from src/rules/registers.ts + src/rules/rhythm.ts guidance, rulebook
 * R5, and the Round-1 calibration note (v4r1-org-tree: compare gap-classes —
 * gutters with gutters; 32-intra vs 128-inter straddling a cluster boundary
 * is the grouping device, not unevenness).
 */
import type { StyleTopic } from "./types";

export const style: StyleTopic = {
  id: "registers-and-rhythm",
  title: "Registers and rhythm",
  prose: [
    "Peers read as peers when they share one centerline — even across section boundaries,",
    "which nesting alone can never say. Exact alignment is the corpus norm; a few pixels off",
    "reads as a mistake, not a choice. When centers crowd within 8px of a shared register,",
    "either align them exactly (the members' median center is the usual register) or separate",
    "them clearly. Pitch along a register runs 192–320 between chip-sized members.",
    "Siblings in a row (or column) keep one pitch: even gaps drawn from the ladder, flush (0)",
    "only for repeated cells. Judge evenness within a gap-class — compare gutters with gutters",
    "and intra-cluster gaps with intra-cluster gaps. A run of 32px inside clusters and 128px",
    "between them is the grouping device itself, not unevenness; but a 96px spread among the",
    "gutters alone (192/288/288) is a real defect that reads as accidental. Keep the pitch",
    "steady within each class (the rung nearest the median gap is the usual pick), or break",
    "the run apart visibly so it reads as two groups instead of one bad one. Defaults, not laws.",
  ].join("\n"),
};
