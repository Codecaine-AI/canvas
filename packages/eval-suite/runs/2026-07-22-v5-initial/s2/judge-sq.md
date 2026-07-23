# SQ — Static Quality Judge

- Scenario: s2 — branching flowchart (order fulfillment)
- Run: 2026-07-22-v5-initial

## Reference calibration

- gc-decomp-harness: 7.5/10
- intent-classification-2: 7.0/10
- CAL-DRIFT: No

## Score

**6.0/10**

## Side-by-side delta

Against the nearer intent-classification-2 reference, this board retains similarly readable branching and semantic color but lacks its framed grouping and cleanly separated branch buses, instead leaving a large empty upper band and showing overlapping return/fraud runs plus a floating “resubmitted” arrow.

## Sub-checks

- Frame use — **FAIL:** The flow spans the width, but a large empty band between the title and the main row leaves the composition bottom-heavy.
- Corridors & air — **PASS:** Main stages and most label chips have generous, arm's-length-readable spacing.
- Grouping — **FAIL:** No tinted regions organize the primary, fraud, backorder, and failure branches; grouping is left to proximity and line color.
- Color — **PASS:** Orange decisions, purple fraud handling, green shipment success, and red dashed failure/refund paths form a restrained semantic palette.
- Machinery leakage — **FAIL:** The oversized floating “resubmitted” arrow is not anchored to nodes, and opposite-direction/overlaid runs leak routing mechanics around “Order valid?” and “Fraud review.”
- Alignment & rhythm — **PASS:** The primary order path holds a strong horizontal register, with secondary branches arranged in legible lower tiers despite the frame imbalance.
- Edge legibility — **FAIL:** Co-linear overlap at the fraud branch and the opposing correction/validation runs create ambiguity, while the long dashed failure routes dominate the lower half.

## Rank-order sanity

Gut ranking is gc-decomp-harness (7.5) > intent-classification-2 (7.0) > s2 (6.0), consistent with the assigned scores.
