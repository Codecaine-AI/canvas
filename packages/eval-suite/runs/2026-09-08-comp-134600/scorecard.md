# Eval-suite scorecard — 2026-09-08-comp-134600
SUT: f3e3fa00+dirty · model codex-lb/gpt-6-astra @ low · prompt df39f45a · lints 20ebe21e · styles 9c3ca8e3 · surface cc54fcdb · tool-call cap 3 (agent default)
Previous run: 2026-09-08-outline-123806 · Sessions: 8 ok / 0 rejected / 0 abandoned / 0 invalid-infra

| scenario | SF | ΔSF | RC | ΔRC | RD | ΔRD | CF | ΔCF | SD | ΔSD | PH | ΔPH | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| agent-session-orchestration | – |  | – |  | 7 |  | 5.5 |  | – |  | 8.5 |  | ERROR(BamlError: BamlClientError: BamlTimeoutError: Request timed out), SKIPPED(e1: system scenario has no follow-up edits) |
| chat-assistant-rollout | 9 |  | 10 |  | 6 |  | 6.5 |  | – |  | 8 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| code-review-agents | 8 | -1 | 9 | 0 | 6.5 | 0 | 5.5 | -0.5 | – |  | 8.5 | +0.5 | SKIPPED(e1: system scenario has no follow-up edits) |
| eval-harness-orchestration | 9 |  | 9 |  | 6.5 |  | 7 |  | – |  | 9 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| ivr-agent-handoff | 7.5 |  | 8 |  | 6.5 |  | 5 |  | – |  | 9.5 |  | SCORE-RECOMPUTED, SKIPPED(e1: system scenario has no follow-up edits) |
| llm-inference-gateway | – |  | 9 |  | 6.5 |  | 5 |  | – |  | 8 |  | ERROR(BamlError: BamlClientError: BamlTimeoutError: Request timed out), SCORE-RECOMPUTED, SKIPPED(e1: system scenario has no follow-up edits) |
| rag-ingestion-retrieval | 9 |  | 9 |  | 7 |  | 5.5 |  | – |  | 8.5 |  | SCORE-RECOMPUTED, SKIPPED(e1: system scenario has no follow-up edits) |
| sandboxed-tool-fleet | 10 |  | 10 |  | 7.5 |  | 5.5 |  | – |  | 8 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| **mean** | **8.75** | **-1.00** | **9.14** | **0.00** | **6.69** | **0.00** | **5.69** | **-0.50** | – |  | **8.50** | **+0.50** | PARTIAL |

## Movements ≥ 1.0 (mandatory narration)

- code-review-agents/SF 9→8: The reconstruction recovers the full system shape and every critical happy-path, safety, degradation, cancellation, and recovery route. Most detailed inputs, outputs, policies, reviewer constraints, and telemetry metrics are also explicit. The main losses are architectural rather than procedural: the specialist reviewers read only as concurrent process steps rather than agents, the head-change monitor and telemetry service are not fully connected component boundaries, and calibration persistence plus the exact confidence-threshold semantics are only partially communicated. The board is highly actionable for lifecycle discussion, but an engineer would still need clarification on agent ownership and calibration-state ownership.

## Axis correlation check

No axis pair moved in lockstep in ≥6/8 scenarios; discrimination requirement holds.
