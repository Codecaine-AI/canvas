# SQ — Static Quality (1–10)
- code: SQ
- scorecard-order: 1
- scored: per scenario (final committed state)
- roles: single judge

*How the final committed board looks next to the reference boards.*

## Judge inputs

Sees: final-state PNG of the scenario board, both reference PNGs, the scenario's genre
name, `axes/README.md`, this file.

Never sees: the build instruction, the fixture spec tables, transcripts, canvas JSON,
other axes' output, the round-1 reports.

## Method

1. Calibrate: view both references and re-score them (targets 7.5 / 7.0; report both —
   drift beyond ±0.5 is CAL-DRIFT, see shared rules).
2. View the board under grade in the same phase.
3. Judge holistically, consulting these seven sub-checks (they guide; they are not
   separately scored):
   1. **Frame use** — is the content composed within the frame, or is a large fraction
      dead space with mass packed to one side? (v4 state-machine committed with the
      bottom ~40% of the locked frame empty — that class of miss.)
   2. **Corridors & air** — does every label chip own clear air; are the gaps between
      sequential stages wide enough to read at arm's length? (Ford's standing critique:
      "too close together if you're actually trying to read it.")
   3. **Grouping** — are tinted sections/regions doing real grouping work the way
      gc-decomp's Runner/Score-gate/Knowledge regions do, or is grouping implied only
      by proximity?
   4. **Color** — semantic and consistent (failure=red-dashed, success=green, one hue
      per flow family) vs decorative noise or monotone-by-neglect. A user-requested
      restrained palette is NOT monotony.
   5. **Machinery leakage** — junction crosshair glyphs, arrowheads terminating into
      waypoints, orphaned/floating badges, wires merging ambiguously. The references
      show zero routing machinery.
   6. **Alignment & rhythm** — registers hold across the board; density variation reads
      deliberate (hero row vs detail cluster) not accidental.
   7. **Edge legibility** — crossings minimized and clean when unavoidable; no
      co-linear overlapping runs, no border-hugging marathons, no perimeter
      mega-detours.

## Rubric

| score | anchor |
|---|---|
| 10 | Clearly better than gc-decomp-harness on every sub-check. Unclaimed; exists so 8–9 mean something. |
| 9 | Indistinguishable from the house exemplars — a fresh viewer shown this board plus the two references cannot pick out which one the agent made. |
| 8 | Reference-grade composition with one visible flaw a reviewer would mention but not fix. |
| **7.5** | **= gc-decomp-harness.** Tinted regions grouping, labeled colored corridors, margin annotations, deliberate density variation, zero machinery. |
| **7.0** | **= intent-classification-2.** Same virtues at smaller scale; slight imbalance (large empty band) keeps it under gc. |
| 6–6.5 | v4 round-1 committed class (`eval-v4-state-machine` after S2/S3): corridors genuinely wide, every chip breathes, semantic color — but machinery leaks (crosshair junctions), a floating unanchored badge, and dead frame. Reads well; doesn't *finish* well. |
| 5 | Clean topology, no overlaps, but flat: no tints, uniform density, long detour edges; you can read it, you wouldn't pin it up. |
| 4 | v3 committed class: perimeter mega-detour edges dominate (swimlane skip-lane around a 2640px lane), stretched empty section towers, off-register rows — structure survives, composition doesn't. |
| 3 | Old-system committed class: overlapping anti-parallel edges reading as bidirectional, floating label rectangles near but not on their edges, crowding below ladder minimums. |
| 2 | Multiple text-covering collisions, a self-loop drawn through its own box, content off the locked frame. |
| 1 | Wrecked: layout communicates nothing; boxes piled or scattered without discernible composition. |

## Caps & overrides

None.

## Output contract

- Both reference calibration scores.
- The score.
- A **one-sentence side-by-side delta** vs the nearer reference ("what the reference
  does that this board doesn't", or vice versa) — a score without it is invalid.
- One short line per sub-check (seven lines), flagging the failing ones.
- A rank-order sanity note when grading multiple boards in one session: gut ranking
  must agree with the scores, reconcile before returning.

## Notes

- Machinery that the agent *declared* as a substitution still counts here — SQ judges
  the artifact's looks, not the agent's honesty (that's PH). One defect can legitimately
  cost two axes through different lenses; that is not double-penalization.
- Dry-run evidence (2026-07-22): two independent judges landed within 0.5 on all five
  eval-v4 boards; the sub-check lines were what made the org-tree/flowchart gap legible.
