# RD judge — incident-response

Score: 6.5

Run: 2026-07-24-eval-154843 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 16242 input / 805 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer intent-classification-2 reference, this board provides stronger phase grouping and more deliberate semantic color, but its truncated text, awkward wrapping, and congested retry routing make it visibly less finished.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 7 | The five-phase workflow fills the locked inner frame from left to right with no major dead band, although generous outer whitespace and unequal phase widths slightly weaken the overall balance. |
| corridors_and_air | 6.5 | Most nodes and chips have clear breathing room, but the lower boundary between Coordinate and Verify is congested by the purple return path, dashed orange retry path, blue status path, and the wide 'no · retry' chip. |
| grouping | 7.5 | Five softly tinted, labeled phase regions clearly organize the incident lifecycle, and distinct internal fills help separate monitoring, triage, coordination, verification, and resolution roles. |
| color | 7 | Blue, amber, orange, purple, and green consistently identify phase and flow families, with dashed orange signaling retry, though some cross-phase node colors introduce mild semantic ambiguity. |
| machinery_leakage | 5.5 | Failure: several routed lines visibly behave like exposed machinery, especially the purple return loop and dashed orange retry route sharing the Coordinate–Verify boundary, with arrowheads landing along bends and crowded junction areas. |
| alignment_and_rhythm | 6 | Failure: the main columns establish a readable rhythm, but inconsistent box widths, forced word breaks such as 'coordinate\ns response,' ellipsized labels, and literal markdown in '**Resolution gate**' disrupt typographic polish. |
| edge_legibility | 5.5 | Failure: the primary vertical flows are clear, but long side-running connectors, tight parallel runs, and the overlapping lower retry/status/return routes make branch ownership harder to follow than in either reference. |

Rank-order sanity: The assigned scores and visual ordering agree: gc-decomp-harness ranks first at 7.5, intent-classification-2 second at 7.0, and the board under grade third at 6.5.
