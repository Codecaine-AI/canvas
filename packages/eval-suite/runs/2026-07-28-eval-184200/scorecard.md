# Eval-suite scorecard — 2026-07-28-eval-184200
SUT: 2f674932+dirty · model codex-lb/gpt-5.6-sol @ low · prompt 93aa6b6d · lints d6b4248b · styles 3446d051 · surface fbd8e704 · tool-call cap 3 (agent default)
Previous run: 2026-07-28-eval-174737 · Sessions: 1 ok / 0 rejected / 0 abandoned / 0 invalid-infra

| scenario | SF | ΔSF | RC | ΔRC | RD | ΔRD | CF | ΔCF | SD | ΔSD | PH | ΔPH | flags |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| rag-ingestion-retrieval | 6 | -1.5 | 5 | -1 | 6.5 | 0 | 6.5 | -1 | – |  | 8 | +5 | SKIPPED(e1: system scenario has no follow-up edits) |
| **mean** | **6.00** | **-1.50** | **5.00** | **-1.00** | **6.50** | **0.00** | **6.50** | **-1.00** | – |  | **8.00** | **+5.00** |  |

## Movements ≥ 1.0 (mandatory narration)

- rag-ingestion-retrieval/SF 7.5→6: The board communicates the system's purpose, major components, primary end-to-end flow, permission boundary, consistent-publication gate, core failure destinations, low-confidence abstention, and the broad background rebuild mechanism. It is strong enough for an architecture discussion, but not an implementation plan. Several system-defining operational semantics are missing or only suggested: unchanged bypass, supersession and stale-record deletion, non-blocking batch quarantine, dead-letter payload and re-entry, repair or rollback of partial publication, feedback-to-ingestion prioritization, continued serving from the current generation during rebuild, and retention of the prior generation for rollback. There are no system-defining contradictions, and the main flow is reconstructable, but multiple important relationships require inference.
- rag-ingestion-retrieval/RC 6→5: The board clearly represents the main RAG serving path, three-store version-consistent publication, permission-aware hybrid retrieval, grounded responses, basic processing exceptions, and the rebuild promotion gate. However, enough operational requirements are missing that it cannot replace the brief in design review—especially document-version lifecycle behavior, partial-write recovery, batch continuation, the feedback-to-ingestion loop, and explicit current/prior generation serving boundaries.
- rag-ingestion-retrieval/CF 7.5→6.5: The board lands at 6.5 because its structured grid, restrained semantic color, and mostly steady registers feel deliberate, but visible routing waypoints and a substantial empty lower band keep it from reading as fully finished.
- rag-ingestion-retrieval/PH 3→8: Mechanically clean on call validity: no tool call returned ERROR, no finalize or request was rejected, and the session had no retry. APPLIED calls carrying lint findings were correctly excluded from the failure count. There was no parse/schema-validation fight or repeated error class.

## Axis correlation check

No axis pair moved in lockstep in ≥6/8 scenarios; discrimination requirement holds.
