# Eval-suite scorecard — 2026-09-08-outline-123806
SUT: f3e3fa00+dirty · model codex-lb/gpt-6-astra @ low · prompt 347d5556 · lints 20ebe21e · styles 64d76f6b · surface 971c0509 · tool-call cap 3 (agent default)
Previous run: 2026-09-08-eval-092548 · Sessions: 1 ok / 0 rejected / 0 abandoned / 0 invalid-infra

| scenario | SF | ΔSF | RC | ΔRC | RD | ΔRD | CF | ΔCF | SD | ΔSD | PH | ΔPH | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| code-review-agents | 9 | 0 | 9 | -1 | 6.5 | -1 | 6 | +1 | – |  | 8 | -1.5 | SCORE-RECOMPUTED, SKIPPED(e1: system scenario has no follow-up edits) |
| **mean** | **9.00** | **0.00** | **9.00** | **-1.00** | **6.50** | **-1.00** | **6.00** | **+1.00** | – |  | **8.00** | **-1.50** |  |

## Movements ≥ 1.0 (mandatory narration)

- code-review-agents/RC 10→9: The board represents virtually the entire stated pipeline, including intake eligibility controls, budgeted context construction, five concurrent reviewers, bounded read-only tooling, aggregation and verification safeguards, policy-driven publication, calibration feedback, head-change recovery, telemetry, and daily-budget degradation. The sole gap is a supporting rationale/priority qualifier rather than missing architecture or failure behavior.
- code-review-agents/RD 7.5→6.5: The board is readable with effort, matching the 6–6.5 anchor because its stage grouping and primary left-to-right flow are clear, but small labels and several long dashed feedback routes require close tracing.
- code-review-agents/CF 5→6: The board breathes and its staged flow is readable, but large dead frame areas, note-heavy regions, and several plain-box vocabulary substitutions leave it at the rubric’s “doesn’t finish” anchor.
- code-review-agents/PH 9.5→8: Mechanically clean: 0 failed calls across 63 tool calls, no rejected calls, no retries, no consecutive failure runs, and no repeated parse/schema/validation error class. The single NO-OP at turn 7 was legal and was not repeated.

## Axis correlation check

No axis pair moved in lockstep in ≥6/8 scenarios; discrimination requirement holds.
