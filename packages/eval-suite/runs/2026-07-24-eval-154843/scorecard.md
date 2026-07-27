# Eval-suite scorecard — 2026-07-24-eval-154843
SUT: 3751f3e+dirty · model codex-lb/gpt-5.6-sol @ low · prompt 722c816f · lints 58f95eeb · styles 2e172a72
Previous run: 2026-07-23-system-smoke · Sessions: 10 ok / 0 rejected / 0 abandoned / 0 invalid-infra
Judge calibration: gc=7.5 intent=7.0 (target 7.5 / 7.0)

| scenario | SF | ΔSF | RC | ΔRC | RD | ΔRD | SD | ΔSD | PH | ΔPH | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|
| backpressured-data-pipeline | 8 |  | 8 |  | 6.5 |  | – |  | 9 |  | SCORE-RECOMPUTED, SKIPPED(e1: system scenario has no follow-up edits) |
| canary-delivery | 7 |  | 8 |  | 7.5 |  | 8 |  | 6 |  | SCORE-RECOMPUTED |
| event-driven-orders | 6 |  | 6 |  | 6.5 |  | – |  | 8.5 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| incident-response | 8 | +1 | 9 | 0 | 6.5 | +1 | – |  | 6 | +1 | SKIPPED(e1: system scenario has no follow-up edits) |
| monorepo-build-cache | 6.5 |  | 9 |  | 7 |  | – |  | 5 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| multi-region-failover | 7 |  | 8 |  | 5.5 |  | – |  | 6 |  | SCORE-RECOMPUTED, SKIPPED(e1: system scenario has no follow-up edits) |
| oauth-session-lifecycle | 7.5 |  | 6 |  | 6.5 |  | – |  | 8 |  | SKIPPED(e1: system scenario has no follow-up edits) |
| webhook-delivery | 7 |  | 6 |  | 5.5 |  | 9 |  | 8 |  |  |
| **mean** | **7.13** | **+1.00** | **7.50** | **0.00** | **6.44** | **+1.00** | **8.50** |  | **7.06** | **+1.00** |  |

## Movements ≥ 1.0 (mandatory narration)

- incident-response/SF 7→8: The reconstruction recovers the complete architecture and main alert-to-learning path: monitoring and deduplication, primary paging and timed secondary escalation, acknowledgement and triage, false-alarm termination, incident-record creation, service-owner investigation and mitigation, on-call coordination and public communication, monitoring-based verification, gated resolution, record preservation, review, and follow-up tracking. The principal fidelity gaps concern operational semantics rather than system shape: concurrency between on-call and service-owner work is only implied, and failed-verification ownership is not explicitly returned to the service owner. A few board-specific organizational claims are more specific than the brief. The result is highly usable for engineering discussion and captures every critical path, but the retry ownership detail prevents it from being fully implementation-exact.
- incident-response/RD 5.5→6.5: Compared with the nearer intent-classification-2 reference, this board provides stronger phase grouping and more deliberate semantic color, but its truncated text, awkward wrapping, and congested retry routing make it visibly less finished.
- incident-response/PH 5→6: Mechanically clean tool usage: all 12 tool calls succeeded, with no rejected calls, retries, or parse/validation fights.

## Axis correlation check

No axis pair moved in lockstep in ≥6/8 scenarios; discrimination requirement holds.
