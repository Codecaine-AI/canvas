# Eval-suite scorecard — 2026-07-28-eval-170417
SUT: 2f674932+dirty · model codex-lb/gpt-5.6-sol @ low · prompt af28d0ed · lints d6b4248b · styles de7fa508 · surface 82bc455d · tool-call cap 3 (agent default)
Previous run: 2026-07-28-eval-164042 · Sessions: 1 ok / 0 rejected / 0 abandoned / 0 invalid-infra

| scenario | SF | ΔSF | RC | ΔRC | RD | ΔRD | CF | ΔCF | SD | ΔSD | PH | ΔPH | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rag-ingestion-retrieval | 5 | -1 | 6 | -4 | 6.5 | 0 | 6 | -0.5 | – |  | 3 | 0 | SKIPPED(e1: system scenario has no follow-up edits) |
| **mean** | **5.00** | **-1.00** | **6.00** | **-4.00** | **6.50** | **0.00** | **6.00** | **-0.50** | – |  | **3.00** | **0.00** |  |

## Movements ≥ 1.0 (mandatory narration)

- rag-ingestion-retrieval/SF 6→5: The board communicates the domain, major ownership boundaries, and primary ingestion-to-grounded-answer flow well enough for a design conversation. Version-consistent three-store publication, parallel hybrid retrieval, permission filtering, citations, feedback prioritization, and most of the rebuild topology survive. However, multiple system-defining operational paths are missing, especially quarantine, dead-letter recovery, partial-write repair, explicit low-confidence refusal, live-query continuity, and retention of the prior generation. The claimed routing of publication inconsistency into the model-rebuild path contradicts the brief's recovery ownership and invokes the system-defining failure-outcome cap. Engineers could agree on the happy-path architecture but would reconstruct materially different failure and recovery designs.
- rag-ingestion-retrieval/RC 10→6: The board substantially covers the primary RAG architecture, version-consistent three-store publication, permission-aware grounded retrieval, feedback prioritization, and atomic index rebuilding. Important operational qualifiers remain weak: source types and boilerplate removal are absent, quarantine does not show failure context or batch continuation, dead-letter storage lacks inputs and attempt history, overlap and several per-fragment metadata guarantees are incomplete, and rollback does not explicitly retain the prior generation. Weighted coverage is 66.5 of 82, or approximately 0.811; the absent system-defining batch-continuation requirement applies the RC cap of 6.

## Axis correlation check

No axis pair moved in lockstep in ≥6/8 scenarios; discrimination requirement holds.
