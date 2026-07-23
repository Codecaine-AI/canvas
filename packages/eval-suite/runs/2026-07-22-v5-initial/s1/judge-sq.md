# SQ — Static Quality

## Reference calibration

- `gc-decomp-harness`: **7.5**
- `intent-classification-2`: **7.0**
- Calibration status: within target; no `CAL-DRIFT`.

## Score

**4.5 / 10**

## Side-by-side delta

Versus the nearer `intent-classification-2` reference (7.0), this board keeps a clean linear register but lacks the reference's balanced frame use, purposeful sectional grouping, semantic color families, and generous transition corridors.

## Sub-checks

- **Frame use — FAIL:** The pipeline occupies one narrow horizontal band while most of the tall frame is dead space, and the oversized annotation sits isolated in the upper-left.
- **Corridors & air — FAIL:** Early chips have adequate gaps, but `deployed` and `verified` are squeezed into neighboring stage boxes instead of owning clear air.
- **Grouping — FAIL:** No tinted regions organize the release phases; grouping is conveyed only by proximity along the row.
- **Color — FAIL:** Nearly the entire pipeline is undifferentiated gray, with only the final Production stage green, so color does little semantic work.
- **Machinery leakage — FAIL:** Several connector labels visually float because their chips consume almost the entire inter-stage run, leaving the underlying arrows unclear.
- **Alignment & rhythm — PASS:** All seven stages hold a consistent baseline, though the unusually narrow Security Scan box and uneven gaps make the rhythm less polished than the references.
- **Edge legibility — FAIL:** There are no crossings or detours, but most post-build connectors are visually swallowed by their label chips, and the final two labels collide with node boundaries.

## Rank-order sanity

Not applicable: one scenario board was graded in this session; its 4.5 placement is below both calibrated references and between the rubric's 4 and 5 anchors.
