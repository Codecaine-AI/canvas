# RD judge — multi-region-failover

Score: 6.5

Run: 2026-07-24-eval-183037 · Model: gpt-5.6-sol · Effort: low · Function: JudgeSurfaceQuality · Attempts: 1
Usage: 16137 input / 749 output tokens
Flags: none

Calibration: gc=7.5, intent=7

Delta: Compared with the nearer intent-classification-2 reference, this board provides stronger region tinting and semantic color but lacks its spacious hierarchy, with denser labels and several harder-to-follow routed connections.

| sub-check | score | finding |
|---|---:|---|
| frame_use | 7 | The major traffic, regional, global-service, control, and failover bands use the frame broadly, though the upper and outer margins are somewhat oversized. |
| corridors_and_air | 6 | Most nodes have adequate breathing room, but several chips and annotations are cramped against wires or nearby objects, especially around Region A, the global-data row, and the control-plane flows. |
| grouping | 7.5 | Distinct tinted containers clearly separate the traffic edge, three regional deployments, global data, control plane, and failover operations; the repeated regional panels are especially easy to scan. |
| color | 7 | Blue, orange, purple, green, and red are used consistently enough to distinguish routing, control, data, recovery, and failure concepts, although the number of simultaneous hues adds visual load. |
| machinery_leakage | 6 | No crosshair junction glyphs appear, but several arrowheads terminate at bends or crowded boundaries, and some partially obscured labels make routing mechanics conspicuous. |
| alignment_and_rhythm | 6.5 | The three regional panels and bottom recovery sequence hold strong registers, but density jumps sharply between sparse regional interiors and crowded global/control sections, producing uneven rhythm. |
| edge_legibility | 5.5 | The main top corridor is clean, but long inter-section runs, close parallel paths, boundary-hugging routes, and label collisions around the lower middle make several dependencies difficult to trace. |

Rank-order sanity: The visual ordering and assigned scores agree: gc-decomp-harness ranks first at 7.5, intent-classification-2 second at 7.0, and the denser board under grade third at 6.5.
