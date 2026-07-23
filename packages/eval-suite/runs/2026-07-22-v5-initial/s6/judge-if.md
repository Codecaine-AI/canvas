# IF — Intent Fidelity

## Per-item verdicts

### Build checklist

- **IF-01 — PASS.** `seed-ceo` exists with text `CEO`, teal color, box-like process shape, `y=64` above panels (`y=464`), and belongs only to `page-frame`.
- **IF-02 — PASS.** `seed-vp-engineering`, `vp-product`, `vp-design`, and `vp-operations` have the four required VP labels and are all teal process boxes.
- **IF-03 — PASS.** Platform, Frontend, Infrastructure, and Security exist as gray process boxes parented by `panel-engineering`.
- **IF-04 — PASS.** Growth and Insights exist as gray process boxes. In the final, edited state, E1 correctly supersedes Growth's original Product membership by moving it to Engineering; Insights remains in Product.
- **IF-05 — PASS.** `team-design-systems` is a gray process box parented by `panel-design`.
- **IF-06 — PASS.** `team-it` and `team-facilities` are gray process boxes parented by `panel-operations`.
- **IF-07 — PASS.** JSON and PNG show no filler team nodes added to equalize the unequal subtrees.
- **IF-08 — PASS.** Four sibling sections are titled Engineering, Product, Design, and Operations and colored teal, violet, orange, and green; the PNG shows the corresponding light washes.
- **IF-09 — PASS.** Final edited membership is exact: Engineering has its VP plus Platform, Frontend, Infrastructure, Security, and Growth; Product has its VP plus Insights; Design has its VP plus Design Systems and Brand Studio; Operations has its VP plus IT and Facilities. Every member rectangle lies fully inside its panel by JSON geometry.
- **IF-10 — PASS.** The CEO is outside all panels and parented directly by `page-frame`.
- **IF-11 — PASS.** The four CEO-to-VP connections exist with forward direction, solid style, and gray color.
- **IF-12 — PASS.** The four VP Engineering connections to Platform, Frontend, Infrastructure, and Security exist with forward direction, solid style, and gray color.
- **IF-13 — PASS.** The final state correctly incorporates E1: Product retains the solid gray forward edge to Insights, while the former Product-to-Growth report is replaced by Engineering-to-Growth.
- **IF-14 — PASS.** `edge-design-systems` runs VP Design → Design Systems and is solid gray with a forward arrow.
- **IF-15 — PASS.** The VP Operations → IT and VP Operations → Facilities edges exist and are solid gray with forward arrows.
- **IF-16 — FAIL.** JSON stores `edge-dotted-design-eng` as `seed-vp-engineering` → `team-design-systems`, the reverse of required Design Systems → VP Engineering. Its connection label is empty; `dotted line` is instead a separate pill. The PNG confirms the reversal with the orange arrowhead entering the top of Design Systems, although the edge is correctly dashed and orange.
- **IF-17 — FAIL.** The PNG shows the CEO → VP Engineering arm entering the right side of VP Engineering and the CEO → VP Operations arm entering the left side of VP Operations, violating the required bottom-exit/top-entry rule. The JSON also supplies no explicit anchors on any connection.
- **IF-18 — FAIL.** `edge-dotted-design-eng` is directionally reversed in JSON and PNG: VP Engineering → Design Systems rather than Design Systems → VP Engineering.
- **IF-19 — PASS.** All ten final leaves have `geometry.y=1392`, an exact shared baseline (and therefore within 16 px).
- **IF-20 — PASS.** VP centers match their solid-child fans within 16 px: Engineering center 768 versus outer-child midpoint 772 (4 px); Product 1272 versus 1272; Design 1648 versus 1648; Operations 2064 versus 2064.
- **IF-21 — PASS.** CEO center is 1416, exactly the midpoint of the outer VP centers, `(768 + 2064) / 2 = 1416`.
- **IF-22 — PASS.** `legend-sticky` is outside all panels on the upper-left board margin and states all three required conventions: solid gray direct reports, orange dashed dotted-line reports, and tinted-panel grouping.
- **IF-NEG-1 — PASS.** No specced node or edge is wholly absent; the dotted edge is present but reversed, which is scored under IF-16/IF-18 and the reversed-direction cap rather than as a silent drop.
- **IF-NEG-2 — PASS.** No extra node, panel, junction glyph, or connection appears beyond the final spec. The separate `edge-dotted-label` pill implements the requested edge label rather than inventing a new relationship.

### E1 — Growth moves to Engineering

- **E1-01 — PASS.** Growth is parented by `panel-engineering`, its rectangle is fully inside that panel, and `y=1392` matches the leaf baseline.
- **E1-02 — PASS.** `edge-eng-growth` runs VP Engineering → Growth, solid gray and forward; the PNG shows bottom-out/top-in routing, and no Product–Growth connection remains.
- **E1-03 — FAIL.** The dotted edge is not intact as required: final JSON has VP Engineering → Design Systems rather than Design Systems → VP Engineering. It remains dashed and orange, but the connection label is empty and the visible text is a separate pill.
- **E1-04 — PASS.** VP Engineering is within 4 px of its five-child midpoint, and VP Product is exactly centered over Insights.

### E2 — Brand Studio under Design

- **E2-01 — PASS.** `team-brand-studio` exists as a gray process box, is fully inside `panel-design`, and shares `y=1392` with all leaves.
- **E2-02 — PASS.** `edge-design-brand-studio` runs VP Design → Brand Studio, solid gray and forward; the PNG shows bottom exit and top entry.
- **E2-03 — PASS.** VP Design center is 1648, exactly the midpoint of Design Systems center 1536 and Brand Studio center 1760.
- **E2-04 — FAIL.** The required dotted-line relationship is directionally wrong in the final JSON and PNG: VP Engineering → Design Systems instead of Design Systems → VP Engineering.

### E3 — Equalize cluster gaps

- **E3-01 — PASS.** JSON panel gutters are exactly 32/32/32 px: `1168−1136`, `1408−1376`, and `1920−1888`.
- **E3-02 — PASS.** CEO center 1416 exactly equals the VP-row midpoint 1416.

## Pass fraction

**P = 29 / 34 = 0.8529.** Under the rubric, `0.80 ≤ P < 0.88` maps to **6**.

## Caps applied

- **Reversed-direction cap 6 applies**, triggered by IF-16/IF-18 (and preserved failures E1-03/E2-04): the dashed exception is reversed. The mapped score is already 6, so the cap does not lower it further.
- The silent-absence cap does not apply: no specced node or edge is wholly missing.
- The destroyed-content cap does not apply: no requested-and-confirmed content is shown to have been destroyed.

## Score

**6 / 10**
