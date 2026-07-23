# SQ — Static Quality: s4

## Reference calibration

- `gc-decomp-harness`: **7.5/10**
- `intent-classification-2`: **7.0/10**
- Calibration status: **stable; no CAL-DRIFT**

## Score

**4.5/10**

## Side-by-side delta

Compared with the nearer `intent-classification-2` reference, this board has similarly clear tinted grouping but lacks the reference's contained, readily traceable routing: its oversized lanes and long border-hugging, partly co-linear dashed runs dominate the composition.

## Sub-checks

- **Frame use — FAIL:** The lane stack uses the width, but broad empty stretches inside Data, Observability, and Workers plus a large empty band below the stack leave the frame visibly under-composed.
- **Corridors & air — MIXED:** Nodes and most chips breathe well, but the `status`, `pull`, and `persist` chips crowd the same far-right routing corridor.
- **Grouping — PASS:** Distinct pastel Frontend, API, Data, Observability, and Workers lanes provide immediate, meaningful structural grouping.
- **Color — MIXED:** Lane tints and the orange dashed queue handoff are semantic and restrained, though gray and orange dashed families are not differentiated consistently enough to clarify the competing long routes.
- **Machinery leakage — FAIL:** Multiple paths merge into or share the far-right vertical run, making the routing mechanism itself conspicuous; the second lane's malformed header glyphs also read as unfinished leakage.
- **Alignment & rhythm — MIXED:** Box sizing and several within-lane registers hold, but the lower lanes are mostly empty on the left while their process mass is packed to the right, producing an uneven rhythm.
- **Edge legibility — FAIL:** Perimeter-scale detours wrap around lane boundaries and stack along the right edge, so several async/status/persistence paths are difficult to follow unambiguously.

## Rank-order sanity

Not applicable: one board was graded in this session.
