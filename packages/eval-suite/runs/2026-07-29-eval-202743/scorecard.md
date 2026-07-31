# Eval-suite scorecard — 2026-07-29-eval-202743
SUT: 49d293dc+dirty · model codex-lb/gpt-5.6-sol @ low · prompt 3acbe92e · lints bdea0700 · styles 3446d051 · surface 2ab275de · tool-call cap 3 (agent default)
Previous run: 2026-07-29-cadence-153707 · Sessions: 8 ok / 0 rejected / 0 abandoned / 0 invalid-infra

| scenario | SF | ΔSF | RC | ΔRC | RD | ΔRD | CF | ΔCF | SD | ΔSD | PH | ΔPH | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| agent-session-orchestration | 4 |  | 4 |  | 7 |  | 7 |  | – |  | 8.5 |  | SCORE-RECOMPUTED, SKIPPED(e1: system scenario has no follow-up edits) |
| chat-assistant-rollout | 6 |  | 4 |  | 6.5 |  | 4.5 |  | – |  | 8 |  | SCORE-RECOMPUTED, SKIPPED(e1: system scenario has no follow-up edits) |
| code-review-agents | 7 |  | 6 |  | 6.5 |  | 5 |  | – |  | 8.5 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| eval-harness-orchestration | 5 |  | 7 |  | 6.5 |  | 7 |  | – |  | 8 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| ivr-agent-handoff | 7 |  | 6 |  | 6.5 |  | 6.5 |  | – |  | 5 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| llm-inference-gateway | 6 |  | 6 |  | 6.5 |  | 7 |  | – |  | 5 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| rag-ingestion-retrieval | 6 |  | 5 |  | 6.5 |  | 7 |  | – |  | 7.5 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| sandboxed-tool-fleet | 5 |  | 6 |  | 6.5 |  | 6.5 |  | – |  | 8.5 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| **mean** | **5.75** |  | **5.50** |  | **6.56** |  | **6.31** |  | – |  | **7.38** |  |  |

## Movements ≥ 1.0 (mandatory narration)

- None.

## Axis correlation check

No axis pair moved in lockstep in ≥6/8 scenarios; discrimination requirement holds.
