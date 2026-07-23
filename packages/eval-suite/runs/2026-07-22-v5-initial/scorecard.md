# Eval-suite scorecard — 2026-07-22-v5-initial
SUT: da2e096+dirty · model codex-lb/gpt-5.6-sol @ high · prompt b17a7e56 · lints 5bf858fc · styles 01b58547
Previous run: none · Sessions: 23 ok / 3 rejected / 1 abandoned / 0 invalid-infra
Judge calibration: gc=7.5 intent=7.0 (target 7.5 / 7.0; no CAL-DRIFT flagged by any SQ judge)
Executor note: runners/judges were Fable agents until ~22:30, codex exec gpt-5.6-sol @ xhigh after (Fable usage limit; see fingerprint.md). First-run scorecard, so no Δ comparability is affected; future runs diff judge calibration against the codex-judged baseline here.
RUN STOPPED EARLY by Ford after s6's SQ/IC/IF landed (verdict already clear): s6 ES/PH not judged; s7 graded stages exist through e1 and s8 through e2 but neither was judged. Dangling proposals (s7-e2, s8-e3) were rejected, not materialized.

| scenario | SQ | ΔSQ | IC | ΔIC | IF | ΔIF | ES | ΔES | PH | ΔPH | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|
| s1-linear-flow | 4.5 | | 4 | | 5 | | 9 | | 5 | | ABANDON(s1-e2, honest) |
| s2-branching-flowchart | 6.0 | | 6.5 | | 9 | | 10 | | 4 | | |
| s3-state-machine | 6.5 | | 7 | | 5 | | 6.67 | | 4 | | |
| s4-swimlane | 4.5 | | 6.5 | | 10 | | 10 | | 4 | | |
| s5-nested-arch | 6.5 | | 5.5 | | 6 | | 9.67 | | 8 | | |
| s6-org-tree | 5.5 | | 6 | | 6 | | – | | – | | PARTIAL(stopped) |
| s7-telemetry-platform | – | | – | | – | | – | | – | | PARTIAL(not judged; stage0+e1 materialized) |
| s8-retrieval-designs | – | | – | | – | | – | | – | | PARTIAL(not judged; stage0+e1+e2 materialized; e3 REJECTED(unreviewed at stop)) |
| **mean** | **5.58** | | **5.92** | | **6.83** | | **9.07** | | **5.00** | | PARTIAL |

## Movements ≥ 1.0 (mandatory narration)
First run — no Δ columns. Row-level narration of the extreme cells:
- s1/SQ 4.5: pipeline composed as one narrow band, most of the locked frame dead; connector labels swallow their runs (judge-sq.md).
- s1/IC 4: the abandoned e2 feedback edge is a CORE fact; blind reader explicitly reported "no return loop" (judge-ic.md).
- s4/SQ 4.5 vs IF 10: perfect content inventory (43/43) under weak composition — border-hugging dashed routes stack and merge on the right edge.
- s6/IC 6 + IF 6: the run's only CORE corruption — the dashed exception edge is reversed in JSON and render; IC corruption cap and IF direction cap both fired on the same defect.
- PH 4s (s2, s3, s4): all three are the "committed a defect the agent demonstrably saw" rubric anchor, twice paired with an inflated "no remaining flaws" summary claim.

## Axis correlation check
No pair moved in lockstep across scenarios (SQ↔IC diverge at s4 by 2.0; IF↔SQ diverge at s4 by 5.5; ES high while everything else varies). Discrimination requirement holds.
