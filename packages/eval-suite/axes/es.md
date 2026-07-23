# ES — Edit Stability (1–10)
- code: ES
- scorecard-order: 4
- scored: per follow-up edit, then averaged (per-edit values in the detail file, the mean on the scorecard)
- roles: single checker

*Across each follow-up edit: does what should stay, stay?*

## Judge inputs

Sees, per edit: the canvas JSON snapshot before and after the edit, the edit
instruction, the fixture's stability invariants for that edit, the commit summary, both
stage PNGs, `axes/README.md`, this file.

Never sees: reference boards, other axes' output.

## Method

1. Classify every object/connection in the pre-edit document as **in-scope** (the edit
   instruction names it or plainly requires touching it — including making room; the
   fixture lists the expected in-scope set) or **out-of-scope**.
2. Diff pre → post and classify every out-of-scope change:
   - **violation** — out-of-scope object moved > 16px (one grid cell), resized,
     restyled, relabeled, re-parented, or deleted; out-of-scope connection rerouted
     through a visibly different corridor, restyled, or relabeled
   - **accommodation** — out-of-scope object shifted ≤ 16px, or a larger shift that is
     (a) minimal, (b) plainly required to give the requested change room, and (c)
     declared in the commit summary. Accommodations are allowed; undeclared large
     shifts are violations even when helpful.
3. Check each fixture-specific **invariant** (e.g. "the four lanes keep their vertical
   order", "leaves stay on one register") individually — an invariant broken is a
   violation regardless of pixel math. Some fixtures tighten the defaults (e.g.
   byte-frozen panels); the fixture's invariant list wins over the 16px default.

## Rubric

| score | anchor |
|---|---|
| 10 | Zero violations, zero undeclared accommodations. The diff is exactly the ask. (v4 state-machine S3: 5 ops — 1 add-object, 3 add-connection, 1 declared make-room move.) |
| 9 | Zero violations; a couple of declared accommodations. |
| 8 | One minor violation (a neighbor drifted 20–40px) with no invariant broken. |
| 7 | 2–3 minor violations, all invariants hold, fought-for properties intact. |
| 6 | Noticeable out-of-scope drift; every invariant holds. |
| 5 | One fixture invariant broken, or a fought-for property (a previously argued-and-settled position/style) regressed. |
| 4 | A region the edit never mentioned was visibly re-laid-out. |
| 3 | Out-of-scope restyling/relabeling on top of geometric churn. |
| 2 | Whole-board re-solve for a local ask (v3 flowchart S6: a 3-pill size fix moved all 13 objects; size normalization silently reclassifying committed geometry). |
| 1 | The edit destroyed prior content (deleted or made unreadable something the build had committed). |

## Caps & overrides

- If the agent **refuses** the edit honestly instead of doing it: ES is not scored for
  that edit (nothing churned) and it is excluded from the mean; the refusal lands in IF
  (items failed) and PH (honesty credited).
- Geometry-only probe edits (readability/rebalance passes) legitimately move many
  objects — for those, the fixture's invariants (topology/labels/styles frozen) replace
  the positional violation math; score from the invariant list.

## Output contract

Per edit: the in-scope classification, every violation and accommodation (object id,
what changed, magnitude, declared or not), invariant-by-invariant verdicts, the
per-edit score. Then the mean.

## Notes

- "Fought-for properties" = anything an earlier session in the scenario visibly argued
  about or fixed (a corridor widened by the readability probe, a declared badge
  anchor). Regressing one is the 5-row even when the pixel math looks tame.
