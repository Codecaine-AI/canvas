# RD judge — agent-session-orchestration

Score: 6.5

Run: 2026-07-25-eval-160035 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 16298 input / 702 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer intent-classification-2 reference, this board offers stronger section tinting and a steadier grid, but its oversized sparse regions, long cross-board return routes, and ambiguous reattach connection make the flow less immediately readable.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 6.5 | The 3×3 section grid uses most of the frame, but each region is much taller than its three-node row requires, leaving conspicuous dead space inside sections and below the content. |
| corridors_and_air | 7 | Nodes and section-title chips have ample breathing room, though the broad inter-row corridor is occupied by several long return lines rather than preserved as clean visual air. |
| grouping | 7.5 | Nine numbered, lightly tinted regions provide clear functional grouping and consistently contain compact three-stage sequences. |
| color | 7 | Section and flow-family hues are restrained and mostly semantic, with red cancellation, green safe outcomes, and dashed colored secondary paths; some orange and teal reuse spans distinct concepts. |
| machinery_leakage | 6 | No crosshair waypoints appear, but the Live client stream–Replay + reattach junction shows opposing arrowheads around a tiny central connection, and several dashed routes terminate into remote nodes with little contextual anchoring. |
| alignment_and_rhythm | 7 | Panel boundaries and three-node rows hold strong registers, but the sparse section interiors and uneven top-row icon treatment weaken the otherwise regular rhythm. |
| edge_legibility | 5.5 | Local left-to-right edges are clean, but multiple gray and dashed paths make very long cross-row or cross-board detours, overlap shared corridors, and create ambiguous merges near streaming, recovery, and lower-row destinations. |

Rank-order sanity: The assigned scores and visual ordering agree: gc-decomp-harness ranks first at 7.5, intent-classification-2 second at 7.0, and the board under grade third at 6.5.
