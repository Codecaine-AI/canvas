# RD judge — backpressured-data-pipeline

Score: 6.5

Run: 2026-07-25-eval-104726 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 15242 input / 721 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer intent-classification-2 reference, this board provides stronger section tinting and semantic color but loses readability through smaller text, several edge labels crowded against or obscured by nodes, and much larger dead corridors between its three rows.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 6 | FAIL: The content spans the frame, but two oversized horizontal bands of empty space separate the three packed rows, making the composition feel stretched rather than intentionally open. |
| corridors_and_air | 6 | FAIL: Most nodes have ample internal air, yet chips such as “authenticated,” “consume,” “common queries,” and “commit + update” run into or disappear beneath adjacent boxes. |
| grouping | 7.5 | The twelve numbered, lightly tinted regions clearly organize the pipeline into functional stages, with two or three nodes in most sections. |
| color | 7.5 | Blue, teal, orange, purple, green, and red are used consistently to distinguish flow families, durable paths, repair, success, and rejection states. |
| machinery_leakage | 7 | No crosshair junctions or obvious waypoint glyphs appear, though a few long routed lines merge visually at section boundaries and make their attachment points less immediate. |
| alignment_and_rhythm | 6.5 | FAIL: The three-row grid and repeated section sizing establish rhythm, but irregular section widths, large inter-row voids, and uneven internal baselines weaken the registers. |
| edge_legibility | 6.5 | FAIL: Crossings are largely avoided, but several long teal and orange routes span multiple regions, and labels squeezed between boxes compromise otherwise clean orthogonal routing. |

Rank-order sanity: The assigned scores and visual ordering agree: gc-decomp-harness ranks first, intent-classification-2 second, and the board under grade third because its strong grouping and color do not fully offset label crowding and stretched frame rhythm.
