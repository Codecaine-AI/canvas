# RD judge — multi-region-failover

Score: 5.5

Run: 2026-07-24-eval-154843 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 16137 input / 664 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer gc-decomp-harness reference, this board has similarly strong semantic regions and color coding but lacks its clear hierarchy, generous corridors, and disciplined edge routing.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 6 | The frame is substantially filled and the major horizontal bands are visible, but the lower half is packed tightly while the upper routing band contains conspicuous unused vertical space. |
| corridors_and_air | 5 | FAIL: Many nodes have adequate internal padding, but several edge-label chips sit against region boundaries or neighboring routes, and the dense lower transitions are difficult to read at arm's length. |
| grouping | 7 | Tinted containers clearly distinguish global routing, governance, three regions, global data, and failover outcomes, providing real semantic grouping despite some overlapping section extents. |
| color | 7 | Blue, green, orange, purple, red, and teal are used consistently enough to distinguish infrastructure, success, control, failure, and data families, though the number of active hues adds visual load. |
| machinery_leakage | 5 | FAIL: Several arrows terminate around bends and container boundaries in ways that expose routing mechanics, with floating-looking chips and ambiguous long-line joins near the regional and failover areas. |
| alignment_and_rhythm | 5.5 | FAIL: The three regional panels establish a useful register, but irregular node spacing, uneven vertical density, and the crowded lower-right outcome cluster weaken the overall rhythm. |
| edge_legibility | 4.5 | FAIL: Long blue and orange perimeter routes traverse multiple sections, hug boundaries, and pass behind or alongside unrelated content, making several cross-region flows difficult to trace unambiguously. |

Rank-order sanity: The assigned scores and visual ordering agree: gc-decomp-harness ranks first, intent-classification-2 second, and the board under grade third because its strong grouping and color are outweighed by substantially denser routing and weaker finish.
