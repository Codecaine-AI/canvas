# RD judge — canary-delivery

Score: 6.5

Run: 2026-07-24-eval-183037 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 17404 input / 738 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with intent-classification-2, this board offers stronger semantic grouping and richer operational detail, but loses equivalent finish through denser corridors, visibly truncated text, and less balanced use of the frame.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 6 | The major stages occupy the frame coherently, but the large central and lower-right white gaps leave the 3B region isolated at the bottom and weaken overall balance. |
| corridors_and_air | 6 | Most nodes have adequate breathing room, but the staging row is crowded by labels and wires, while several chips sit too close to adjacent text or edge runs. |
| grouping | 8 | Distinct blue, violet, peach, and teal tinted regions clearly separate build, staging, regional rollout, and control-plane responsibilities. |
| color | 7.5 | Green success, red failure, amber decisions, and family-specific section colors are consistent and strongly semantic rather than decorative. |
| machinery_leakage | 6.5 | No crosshair glyphs or orphaned badges appear, but the control-plane fan-in and several tightly joined staging routes expose routing structure more visibly than either reference. |
| alignment_and_rhythm | 6.5 | Rows within individual regions generally register well, but density shifts abruptly from the packed top band to broad empty inter-region bands, and truncated labels such as “DB compati...,” “Active revision...,” and “Compensation declared...” reduce craft. |
| edge_legibility | 6 | Most orthogonal paths remain traceable, but long frame-spanning promotion routes, close parallel runs, and label/line congestion across the staging section make several transitions harder to parse at a glance. |

Rank-order sanity: The visual ordering and assigned scores agree: gc-decomp-harness ranks first at 7.5, intent-classification-2 second at 7.0, and the board under grade third at 6.5.
