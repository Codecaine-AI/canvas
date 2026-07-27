# RC — Requirement Coverage (1–10)
- code: RC
- scorecard-order: 2
- scored: per scenario (final committed state)
- roles: single checker

*Is every requirement stated in the brief represented somewhere on the board?*

## Judge inputs

Sees: the brief, final PNG, final canvas JSON, the shared judge rules, and this file.

Never sees: reference boards, transcripts, commit summaries, scenario configuration,
other axes' output, or any pre-derived checklist.

## Method

1. Read the brief before inspecting the board. Split it into atomic stated
   requirements and copy the supporting brief language into one row per requirement.
   Include requested components, responsibilities, relationships, ordering,
   constraints, data/control behavior, failure behavior, recovery behavior, and
   operational boundaries. Do not add conventional architecture expectations that
   the brief did not state.
2. Mark each requirement as **system-defining** when losing it changes the system's
   identity, primary behavior, safety, or failure semantics; otherwise mark it
   **supporting**.
3. Inspect the PNG and JSON together. A requirement may be represented by any clear
   visual form: a labeled component, connection, region, note, legend, sequence,
   repeated topology, or another unambiguous encoding. Do not require a particular
   shape, color, position, or diagram genre.
4. Assign one status per requirement:
   - **represented** — the full stated meaning is present and unambiguous;
   - **partial** — a recognizable portion is present, but a stated qualifier,
     endpoint, direction, condition, or outcome is missing;
   - **absent** — no board evidence represents the requirement;
   - **contradicted** — the board communicates behavior inconsistent with it.
5. Compute weighted coverage **P** with system-defining requirements weighted 2 and
   supporting requirements weighted 1. Represented earns full weight, partial earns
   half, and absent or contradicted earns zero. Map P using the rubric, then apply
   caps.

## Rubric

| score | anchor |
|---|---|
| 10 | P = 1.00. Every stated component, relationship, constraint, and failure/recovery behavior is represented fully and consistently. |
| 9 | P ≥ 0.95, with no absent or contradicted system-defining requirement. The board is complete enough to serve as the brief's visual acceptance record. |
| 8 | P ≥ 0.90. All system-defining requirements are represented; only small supporting qualifiers are partial or absent. |
| 7 | P ≥ 0.82. The architecture and operational contract are substantially covered, with a few supporting gaps that do not change the design. |
| 6 | P ≥ 0.72. Most stated behavior is present, but one important path, boundary, or constraint is absent or several are partial. |
| 5 | P ≥ 0.60. The main system is represented, while enough stated behavior is missing that the board cannot replace the brief in a design review. |
| 4 | P ≥ 0.45. Component coverage is mixed and major relationships, failure semantics, or constraints are missing. |
| 3 | P ≥ 0.30. A minority of the requested system is represented; the result is closer to a sketch than a requirements view. |
| 2 | P > 0. Some brief concepts appear, but coverage is too sparse to verify the requested system. |
| 1 | P = 0. None of the stated requirements is represented. |

## Caps & overrides

- Any **absent system-defining** requirement caps RC at **6**.
- Any **contradicted system-defining** requirement caps RC at **4**.
- A requirement represented only in a legend or note receives full credit when the
  meaning is clear; diagram form is not itself a requirement.
- Requirements are derived only from the brief. Do not treat the edit configuration,
  common industry practice, or an imagined implementation as requirements.

## Output contract

- One row per atomic requirement, in brief order, with:
  - a stable `R1`, `R2`, … id;
  - the requirement and its supporting brief evidence;
  - system-defining/supporting importance;
  - represented/partial/absent/contradicted status;
  - PNG or JSON evidence that settles the call, including an explicit inspected-area
    or searched-structure record for absence;
  - a short note explaining partial or contradictory calls.
- Weighted coverage P.
- Every applied cap with the triggering requirement id and reason.
- The score and a concise coverage summary naming the strongest covered cluster and
  the most consequential gap.

## Notes

- RC asks whether stated requirements landed; SF asks what a blind engineer actually
  reconstructs. A requirement can be technically present yet communicate too weakly
  to survive SF.
