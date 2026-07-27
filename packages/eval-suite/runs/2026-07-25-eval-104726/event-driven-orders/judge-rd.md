# RD judge — event-driven-orders

Score: 7

Run: 2026-07-25-eval-104726 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 15559 input / 762 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer gc-decomp-harness reference, this board has similarly clean tinted grouping and routing but lacks the reference’s deliberate density variation and instead relies on a rigid nine-panel grid with conspicuous horizontal dead bands.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 6.5 | The nine regions span the frame, but large empty horizontal bands separate the three rows and make the composition feel more tiled than fully integrated. |
| corridors_and_air | 7.5 | Nodes and label chips generally have generous breathing room, though several labels sit tightly over long runs and the very wide canvas reduces arm’s-length text readability. |
| grouping | 8 | Nine clearly titled, softly tinted regions provide strong functional grouping, with each section holding only a small and readable set of nodes. |
| color | 7 | Section and flow colors are restrained and mostly consistent, but orange serves several concepts and outcomes are not differentiated as explicitly as the reference’s success/failure semantics. |
| machinery_leakage | 8 | No crosshair junctions, exposed waypoints, orphaned badges, or ambiguous wire merges are visible; arrowheads terminate cleanly. |
| alignment_and_rhythm | 6.5 | The three-column registers are strong, but repeated equal-sized panels and sparse interiors create a mechanical rhythm with less deliberate density variation than gc-decomp-harness. |
| edge_legibility | 7 | Crossings are effectively absent and local routes are clear, but the long green OrderConfirmed run and the dashed repair-and-replay route become near-perimeter marathons across multiple regions. |

Rank-order sanity: The assigned scores and visual ordering agree: gc-decomp-harness ranks first at 7.5, while the board under grade and intent-classification-2 sit together at 7.0 for different visible limitations.
