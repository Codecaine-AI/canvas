# RD judge — webhook-delivery

Score: 6.5

Run: 2026-07-25-eval-104726 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 15136 input / 772 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer intent-classification reference, this board offers stronger tinted grouping and semantic color but loses finish through several oversized cross-board routes and a less balanced use of the frame.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 6 | The eight numbered regions occupy the full canvas, but a broad central-to-lower-right band remains largely empty while the upper flow and lower-left clusters carry most of the visual mass. |
| corridors_and_air | 7 | Nodes and most pill labels have generous breathing room, though the long green, magenta, orange, and gray corridors compete in the central gap rather than reading as clean sequential lanes. |
| grouping | 7.5 | Distinct tinted and titled regions clearly organize ingress, fan-out, queueing, signing, retry, dead-letter, operations, and replay, with mostly two to three nodes per section. |
| color | 7 | Blue, purple, teal, green, amber, orange, gray, and magenta consistently distinguish functional families and outcomes, although the number of simultaneous hues makes the global flow busier than either reference. |
| machinery_leakage | 6.5 | No crosshair junction glyphs or orphaned badges are visible, but several arrows terminate after very long waypointed runs, and the dashed magenta replay route reads partly like exposed routing machinery. |
| alignment_and_rhythm | 6.5 | The upper regions share a strong horizontal register and internal node alignment is orderly, but the staggered lower sections and isolated delivery-guarantees card weaken the overall rhythm. |
| edge_legibility | 5.5 | Failure: multiple perimeter-scale detours dominate the composition, including the magenta loop from replay toward the queue, the green route spanning signing, admission, and replay, and the top-right dashed teal return. |

Rank-order sanity: The assigned scores and visual ordering agree: gc-decomp-harness ranks first, intent-classification-2 second, and the board under grade third because its richer grouping does not offset its conspicuous routing detours and frame imbalance.
