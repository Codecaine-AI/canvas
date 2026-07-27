# RD judge — sandboxed-tool-fleet

Score: 6.5

Run: 2026-07-25-eval-160035 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 16615 input / 733 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer intent-classification-2 reference, this board offers stronger tinted grouping and semantic color but uses its frame less efficiently, leaving oversized empty regions and rendering labels comparatively small at full-board scale.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 5.5 | FAIL: The upper fleet occupies only part of its tall container, while the governance section is an especially deep, mostly empty band and the lower edge of the overall frame remains unused. |
| corridors_and_air | 7 | Chips generally have clear air and sequential stages are well separated, though the excessive spacing across the giant canvas makes several labels and nodes feel underscaled rather than comfortably readable. |
| grouping | 7.5 | Tinted blue, orange, purple, teal, amber, and pink regions clearly distinguish admission, placement, boot, lifecycle, health, controls, outputs, and governance responsibilities. |
| color | 7.5 | Color is restrained and meaningfully consistent, with teal dashed capacity/health flows, red-orange failure paths, green readiness, and distinct hues for lifecycle and output families. |
| machinery_leakage | 7.5 | No crosshair junctions, exposed waypoints, or orphaned badges are visible; arrowheads terminate cleanly on nodes, although the small standalone edge chips visually approach floating-label territory. |
| alignment_and_rhythm | 6.5 | The four top stages and three middle support regions hold strong registers, but the very sparse governance strip and uneven vertical density weaken the board-wide rhythm. |
| edge_legibility | 6.5 | Most routes are clean and crossings are minimal, but the long dashed teal runs between lower support regions and upper boot stages create conspicuous cross-board marathons. |

Rank-order sanity: The assigned scores and visual ordering agree: gc-decomp-harness ranks first, intent-classification-2 second, and the board under grade third because its clean grouping and routing do not overcome its weaker frame use and oversized dead bands.
