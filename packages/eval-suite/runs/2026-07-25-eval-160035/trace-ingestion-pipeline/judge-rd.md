# RD judge — trace-ingestion-pipeline

Score: 7.5

Run: 2026-07-25-eval-160035 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 16826 input / 759 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with gc-decomp-harness, this board has cleaner modular sectioning and more generous local air, but lacks the reference’s compact frame use, deliberate density variation, and consistently economical inter-region routing.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 6.5 | The eight regions form a balanced grid, but the large unused band beneath the bottom row leaves the overall frame visibly underfilled. |
| corridors_and_air | 8 | Nodes and label chips have ample breathing room, with wide gaps between sequential stages and no visibly cramped text. |
| grouping | 8.5 | Eight numbered, lightly tinted regions provide explicit and effective functional grouping, generally holding only a few nodes apiece. |
| color | 8 | Distinct section and flow-family hues are restrained and consistent, although gray links and exception colors do not establish semantics as rigorously as the gc reference. |
| machinery_leakage | 7.5 | No crosshair junctions or orphaned badges are visible, but the purple return path makes an awkward exposed loop around the durable-log nodes. |
| alignment_and_rhythm | 8 | Section columns, headers, and principal node rows hold strong registers, though the sparse lower-right region and oversized outer margins weaken density rhythm. |
| edge_legibility | 7 | Most local links are short and clean, but the long purple out-of-order route and the pink every-trace connector create conspicuous inter-row detours. |

Rank-order sanity: The assigned scores and visual ordering agree: gc-decomp-harness and the board under grade are jointly strongest at 7.5, with intent-classification-2 slightly behind at 7.0 because of its larger compositional imbalance.
