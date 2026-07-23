# SQ — Static Quality

- Reference calibration — `gc-decomp-harness`: **7.5/10**
- Reference calibration — `intent-classification-2`: **7.0/10**
- Calibration status: **No CAL-DRIFT**
- **SQ score: 6.5/10**

Side-by-side delta: Compared with `intent-classification-2` (7.0), this board has stronger nested-region grouping but lacks the reference's routing discipline, with several purple event paths bunching at the Event Bus and long dashed telemetry detours diluting the composition.

## Sub-checks

- **Frame use — Pass:** The VPC anchors the center while external systems and the eventing note distribute weight around it; the top band is airy but not debilitating.
- **Corridors & air — Flag:** Most chips have generous clearance, but `payment captured`, `audit events`, and `publish` crowd the narrow approach to the Event Bus.
- **Grouping — Pass:** The VPC, Public Subnet, and App Subnet use nested tinted regions to make containment immediately legible.
- **Color — Pass:** Purple consistently carries event traffic, gray carries synchronous or telemetry traffic, and service fills remain restrained and distinguishable.
- **Machinery leakage — Flag:** Multiple close purple routes coalesce immediately before a single Event Bus arrowhead, making the final convergence look like routing machinery even though there are no crosshair glyphs.
- **Alignment & rhythm — Pass:** The central service cluster, surrounding integrations, and lower observability tier establish deliberate density variation and generally stable registers.
- **Edge legibility — Flag:** The dashed metrics lines form long U-shaped bottom detours, while the tight parallel bus-entry runs are harder to trace than the reference's cleaner branches.

Rank-order sanity: **gc-decomp-harness (7.5) > intent-classification-2 (7.0) > s5 final board (6.5)**; the gut ranking agrees with the scores.
