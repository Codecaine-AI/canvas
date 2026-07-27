# RD judge — backpressured-data-pipeline

Score: 6.5

Run: 2026-07-24-eval-183037 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 16137 input / 726 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer intent-classification-2 reference, this board offers stronger tinted stage grouping and semantic flow colors but lacks the reference’s clean routing, generous air, and immediately legible hierarchy.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 7 | The three main horizontal stages and lower-right operations panel use the frame well, though the upper stage is noticeably more crowded than the lower regions. |
| corridors_and_air | 6 | FAIL: Many chips have adequate padding, but central labels such as “authenticated + tagged,” “normalized + redacted,” and “completed partitions” are squeezed against nodes or partially obscured by them. |
| grouping | 7.5 | Large blue, teal, lavender, and orange tinted regions clearly separate ingest, transform, storage/query, and operations, with labeled headers making the grouping functional. |
| color | 7 | Blue, teal, purple, orange, and red consistently distinguish flow families and exception paths, although the number of simultaneous hues and dashed orange/red routes creates some visual noise. |
| machinery_leakage | 6.5 | FAIL: There are no crosshair junctions, but several arrowheads terminate amid dense bends or shared runs, and the standalone lightning alert icon reads slightly like a floating badge. |
| alignment_and_rhythm | 6.5 | The broad stage registers hold, but node baselines vary within sections, several labels are visibly truncated inside boxes, and the dense middle-right repair cluster disrupts the otherwise orderly rhythm. |
| edge_legibility | 5.5 | FAIL: Long dashed feedback paths, nested bends around the durable log and repair area, close parallel runs, and label/edge interference make several routes difficult to trace cleanly. |

Rank-order sanity: The visual ordering and assigned scores agree: gc-decomp-harness ranks first at 7.5, intent-classification-2 second at 7.0, and the board under grade third at 6.5.
