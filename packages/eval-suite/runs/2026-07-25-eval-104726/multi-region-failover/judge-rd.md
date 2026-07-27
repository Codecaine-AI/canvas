# RD judge — multi-region-failover

Score: 6.5

Run: 2026-07-25-eval-104726 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 16298 input / 732 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer intent-classification-2 reference, this board has similarly clear semantic color and sectioning but weaker frame balance, longer routing detours, and a much larger unproductive central band.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 5.5 | FAIL: The top traffic strip, middle regional row, and bottom data/control panels leave an oversized empty vertical band through the center and substantial unused space below the committed content. |
| corridors_and_air | 7 | Most nodes and edge chips have generous breathing room, although the extreme spacing between the regional row and bottom panels turns useful air into compositional dead space. |
| grouping | 7.5 | Tinted, titled regions clearly separate global traffic, three regional deployments, global data/payments, and the failover control plane, with the repeated regional grouping especially easy to scan. |
| color | 7.5 | Blue traffic, teal regional infrastructure, purple shared data, orange control, green success, and red promotion states form a consistent semantic palette rather than decorative noise. |
| machinery_leakage | 7 | No crosshair junctions or obvious waypoint glyphs are exposed, but the unlabeled blue three-way branch above the regional panels reads somewhat like routing scaffolding. |
| alignment_and_rhythm | 6.5 | The three regional panels maintain strong repeated registers, but the bottom panels have unequal widths and baselines, and the isolated middle void breaks the board's vertical rhythm. |
| edge_legibility | 6 | FAIL: Edges avoid crossings, but the blue regional fan-out and purple database-to-replication route make long orthogonal detours across large empty areas, while the dashed decisions route spans much of the lower board. |

Rank-order sanity: The visual ordering and assigned scores agree: gc-decomp-harness (7.5) ranks first, intent-classification-2 (7.0) second, and the board under grade (6.5) third.
