# Eval suite — canvas layout agent

Standing, repeatable evaluation for the layout agent (harness :4820, studio :4000).
Designed 2026-07-22 against the v4/v5 system; grading anchored to the reference boards
`gc-decomp-harness` (7.5) and `intent-classification-2` (7.0). Run it on any change to
rules, prompt, lints, perception, or model config; diff the scorecards.

| file | what |
|---|---|
| [axes/](axes/README.md) | The grading axes, one file per axis in a canonical structure — currently **SQ** static quality ([sq.md](axes/sq.md), side-by-side vs references), **IC** information comprehension ([ic.md](axes/ic.md), blind PNG-only reconstruction scored against the fixture's comprehension key), **IF** intent fidelity ([if.md](axes/if.md), checklist vs canvas JSON), **ES** edit stability ([es.md](axes/es.md), out-of-scope churn per follow-up edit), **PH** process health ([ph.md](axes/ph.md), transcript honesty + mechanics). Shared rules in [axes/README.md](axes/README.md); judges are instantiated from [axes/JUDGE-PROMPT.md](axes/JUDGE-PROMPT.md) + one axis file, so adding/removing an axis = adding/removing a file. |
| [RUNNER.md](RUNNER.md) | End-to-end protocol: preconditions + SUT fingerprint, fresh `eval-suite-*` canvas lifecycle, session execution + accept/materialize recipe, judge isolation, the diffable scorecard format, diff interpretation, suite maintenance. |
| [scenarios/](scenarios/) | Eight frozen fixtures, complexity 1→5, each with a verbatim build instruction, ground-truth tables, comprehension key, IF checklist, and 2–3 follow-up edits with ES invariants. |
| [dry-run-2026-07-22.md](dry-run-2026-07-22.md) | Rubric validation against the committed `eval-v4-*` boards: SQ spread 5.5–7.0 (within 0.5 of the round-1 evaluators on every board, independently), IC spread 6.5–10, and the discrimination analysis. Judge evidence in [dry-run/](dry-run/). |

## Scenarios

| id | genre | cx | probes |
|---|---|---|---|
| s1-linear-flow | linear flow | 1 | pure composition; mid-flow insert; additive feedback edge |
| s2-branching-flowchart | branching flowchart | 2 | branch add; failure-family restyle; **the nudge probe** (fine-grained control) |
| s3-state-machine | state machine w/ cycles | 3 | declared self-loop badge substitution; **readability probe**; junction-machinery removal |
| s4-swimlane | swimlane pipeline | 3 | lane insertion (skip-lane creation trap); additive skip edge; lane tightening |
| s5-nested-arch | nested architecture + hub | 4 | containment discipline; **restyle-without-relayout probe**; satellite-only hub rebalance |
| s6-org-tree | org tree | 3 | cross-panel re-parent; fan growth; gap equalization (registers + centering held) |
| s7-telemetry-platform | composite: multi-region map | 5 | gc-decomp-class; region add in dead space; readability probe; feedback-corridor reroute |
| s8-retrieval-designs | composite: comparative design | 5 | intent-2-class two-alternatives framing; frozen-panel fan add; panel rebalance |

Fixtures are frozen: any wording change bumps that file's `fixture-rev` and voids
run-over-run comparison for that scenario (RUNNER.md §7).
