# ES — Edit Stability

## E1 — Insert Security Scan mid-flow

### Scope classification

- **In scope:** `stage-security-scan` (n7, new); `edge-all-green-security` (e6, new); `edge-no-criticals` (e7, new); `edge-all-green` (e3, removed); and the permitted declared along-axis make-room slide of `stage-staging-deploy` (n4), `stage-smoke-tests` (n5), and `stage-production` (n6).
- **Out of scope:** `page-frame`; `seed-commit` (n1); `seed-ci-build` (n2); `stage-unit-tests` (n3); `pipeline-promise` (a1); `edge-push` (e1); `edge-artifact-ready` (e2); `edge-deployed` (e4); and `edge-verified` (e5).

### Violations and accommodations

- **Violations:** none.
- **Accommodation — `stage-staging-deploy`:** x changed 1344 → 1568, a **224 px rightward** move; y, width, height, parent, label, type, and color are unchanged. This was an along-flow-axis make-room shift, and the commit summary declared that Staging Deploy was slid horizontally.
- **Accommodation — `stage-smoke-tests`:** x changed 1760 → 1872, a **112 px rightward** move; y, width, height, parent, label, type, and color are unchanged. This was an along-flow-axis make-room shift, and the commit summary declared that Smoke Tests was slid horizontally.
- `stage-production` was permitted in scope for a suffix slide but remained byte-identical at x=2176, y=736, so it is not an accommodation. The viewed PNGs confirm that the two moved stages stay on the same horizontal register and retain their order; e4 and e5 remain in the same straight horizontal corridor rather than being rerouted.

### Stability invariants

1. **PASS — untouched prefix positions:** `seed-commit`, `seed-ci-build`, and `stage-unit-tests` retain byte-identical geometries (0 px movement each).
2. **PASS — e1/e2 frozen properties:** `edge-push` and `edge-artifact-ready` retain identical endpoints, labels, styles, and colors.
3. **PASS — downstream order/register and declared motion:** Staging Deploy, Smoke Tests, and Production remain ordered left-to-right at y=736. The only suffix motion is horizontal: +224 px, +112 px, and 0 px respectively, with the moved stages declared in the commit summary.
4. **PASS — e4/e5 frozen properties:** `edge-deployed` and `edge-verified` retain identical endpoint object IDs, labels, solid styles, and gray colors.
5. **PASS — sticky frozen:** `pipeline-promise` retains byte-identical geometry and text.
6. **PASS — no restyle/recolor/relabel:** No pre-existing node or edge changed its label, style, or color. Side-by-side PNG inspection also shows the neutral/green treatment unchanged.

**E1 score: 9/10.** There are zero violations and two declared make-room accommodations, matching the 9-point rubric row.

## E2 — Add regression-loop feedback edge

### Scope classification

- **In scope:** the requested new feedback connection e8 only.
- **Out of scope:** all existing objects (`page-frame`, the seven stage nodes, and `pipeline-promise`) and all six existing connections (e1, e2, e4, e5, e6, e7).

### Violations, accommodations, and invariants

- **Violations:** none; no proposal materialized and the board remained byte-identical to E1.
- **Accommodations:** none.
- **PASS — all object positions frozen:** the seven nodes and sticky did not move.
- **PASS — all existing edges frozen:** endpoints, routes, labels, styles, and colors did not change.
- **PASS — no existing restyling or relabeling:** no existing content changed.

**E2 score: excluded (not scored).** The session ended in an honest agent-abandon with zero operations and no proposal. Under the ES refusal override and the scenario-specific ruling, this edit is excluded from the mean because nothing churned.

## Mean

**ES mean: 9/10** (E1 = 9; E2 excluded).
