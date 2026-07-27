# RD judge — webhook-delivery

Score: 5.5

Run: 2026-07-24-eval-154843 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 16982 input / 758 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer intent-classification-2 reference, this board offers stronger semantic section tinting but lacks its clean branching structure, balanced frame use, and consistently unobstructed connectors.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 5 | Failure: the upper half is densely packed while large lower-right and lower-center areas remain empty, with the unusually tall fan-out section pulling the composition downward. |
| corridors_and_air | 5.5 | Most nodes have adequate internal padding, but labels around the delivery worker, customer endpoint, and retry loop sit on or too near connectors and neighboring objects. |
| grouping | 7 | Five clearly titled pastel regions provide real semantic grouping, especially for ingress, endpoint state, delivery/retry, dead letters, and operations. |
| color | 6.5 | Blue, teal, orange, red, green, and purple are used meaningfully by function and outcome, though the many simultaneous hues become visually busy around the central delivery cluster. |
| machinery_leakage | 4.5 | Failure: opposing arrowheads and short exposed stubs appear beside the signing/customer-endpoint junction, while several merged routes around the endpoint and status branch expose routing machinery. |
| alignment_and_rhythm | 5.5 | Vertical registers within individual regions are mostly coherent, but section heights vary abruptly and the crowded delivery cluster contrasts awkwardly with the long sparse lower corridors. |
| edge_legibility | 4.5 | Failure: long replay and retry perimeter detours dominate the lower board, central routes overlap or converge ambiguously, and labels such as the active-secret and backoff text are crossed or clipped by wires. |

Rank-order sanity: The visual ordering and assigned scores agree: gc-decomp-harness ranks first at 7.5, intent-classification-2 second at 7.0, and the board under grade third at 5.5.
