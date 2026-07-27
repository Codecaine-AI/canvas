# RD judge — incident-response

Score: 5.5

Run: 2026-07-23-system-smoke · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 17346 input / 637 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer intent-classification-2 reference, this board has similarly clear color-coded sections but uses the frame far less effectively and exposes substantially more awkward branching and retry-routing machinery.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 4 | Failure: the workflow is packed into the upper-left while roughly half the frame remains empty across the right and bottom, creating severe visual imbalance. |
| corridors_and_air | 6.5 | Most nodes and labels have generous breathing room, although several branch corridors in the lower blue and central orange sections tighten into visually busy junctions. |
| grouping | 7 | The three softly tinted, titled phase regions provide clear and useful grouping, with node colors reinforcing roles across region boundaries. |
| color | 6.5 | Blue, orange, green, yellow, and red are applied consistently enough to convey phase and status, though the mixed role-versus-phase semantics require some inference. |
| machinery_leakage | 4.5 | Failure: exposed T-junction stubs, arrowheads aimed at shared rails, and the central retry loop make routing construction visibly intrude on the diagram. |
| alignment_and_rhythm | 6 | Vertical stacks and section headers hold strong registers, but the dense first two phases beside the sparse third phase and vast unused frame produce an uneven overall rhythm. |
| edge_legibility | 5 | Failure: primary vertical sequences are clear, but the central parallel branches, return loop, and lower decision splits contain ambiguous rail merges and awkward terminal geometry. |

Rank-order sanity: The assigned scores and visual ordering agree: gc-decomp-harness ranks first, intent-classification-2 second, and the board under grade third.
