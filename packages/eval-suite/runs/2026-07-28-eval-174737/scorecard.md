# Eval-suite scorecard — 2026-07-28-eval-174737
SUT: 2f674932+dirty · model codex-lb/gpt-5.6-sol @ low · prompt 09b7c1c8 · lints d6b4248b · styles de7fa508 · surface 789f67aa · tool-call cap 3 (agent default)
Previous run: 2026-07-28-eval-170417 · Sessions: 1 ok / 0 rejected / 0 abandoned / 0 invalid-infra

| scenario | SF | ΔSF | RC | ΔRC | RD | ΔRD | CF | ΔCF | SD | ΔSD | PH | ΔPH | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rag-ingestion-retrieval | 7.5 | +2.5 | 6 | 0 | 6.5 | 0 | 7.5 | +1.5 | – |  | 3 | 0 | SKIPPED(e1: system scenario has no follow-up edits) |
| **mean** | **7.50** | **+2.50** | **6.00** | **0.00** | **6.50** | **0.00** | **7.50** | **+1.50** | – |  | **3.00** | **0.00** |  |

## Movements ≥ 1.0 (mandatory narration)

- rag-ingestion-retrieval/SF 5→7.5: The reconstruction preserves the complete system shape and the primary ingestion-to-grounded-answer path, including ACL propagation, hash-based version handling, overlapping metadata-bearing chunks, rate-limited embedding, synchronized publication, parallel hybrid retrieval, reranking, permission filtering, citations, feedback, and safe index-generation switchover. No system-defining flow is contradicted. Fidelity falls short of fully actionable implementation detail because several operational semantics are softened or absent: concrete source classes, per-document batch isolation, dead-letter exhaustion and reprocessing, an explicit generation-service boundary and retrieved-evidence-only rule, exact low-confidence triggers, and a visibly closed feedback loop. The result is highly usable for design discussion, but a few failure and degraded-mode details still require clarification.
- rag-ingestion-retrieval/CF 6→7.5: The board lands between composed and finished: it fills the frame with intentional sections, meaningful flow colors, and strong registers, but a broad central gap and an ambiguous multi-wire convergence near publication keep it below the 8 anchor.

## Axis correlation check

No axis pair moved in lockstep in ≥6/8 scenarios; discrimination requirement holds.
