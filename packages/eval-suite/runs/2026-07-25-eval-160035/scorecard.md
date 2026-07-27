# Eval-suite scorecard — 2026-07-25-eval-160035
SUT: 3751f3e+dirty · model codex-lb/gpt-5.6-sol @ low · prompt 0348edec · lints c5cb2cec · styles 3152f6fc
Previous run: 2026-07-25-eval-104726 · Sessions: 10 ok / 0 rejected / 0 abandoned / 0 invalid-infra
Judge calibration: gc=7.5 intent=7.0 (target 7.5 / 7.0)

| scenario | SF | ΔSF | RC | ΔRC | RD | ΔRD | SD | ΔSD | PH | ΔPH | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|
| agent-session-orchestration | 5 |  | 4 |  | 6.5 |  | – |  | 5 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| code-review-agents | 6.5 |  | 5 |  | 6.5 |  | – |  | 8 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| eval-harness-orchestration | 8 |  | 9 |  | 6 |  | 8 |  | 8 |  |  |
| ivr-agent-handoff | 7 |  | 6 |  | 6.5 |  | – |  | 6 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| llm-inference-gateway | 6 |  | 5 |  | 6.5 |  | 6 |  | 5 |  |  |
| rag-ingestion-retrieval | 7 |  | 5 |  | 6 |  | – |  | 8 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| sandboxed-tool-fleet | 4 |  | 6 |  | 6.5 |  | – |  | 8.5 |  | SCORE-RECOMPUTED, SKIPPED(e1: system scenario has no follow-up edits) |
| trace-ingestion-pipeline | 7 |  | 6 |  | 7.5 |  | – |  | 9 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| **mean** | **6.31** |  | **5.75** |  | **6.50** |  | **7.00** |  | **7.19** |  |  |

## Movements ≥ 1.0 (mandatory narration)

- None.

## Axis correlation check

No axis pair moved in lockstep in ≥6/8 scenarios; discrimination requirement holds.
