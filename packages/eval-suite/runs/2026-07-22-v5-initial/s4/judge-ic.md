# IC — Information Comprehension score

- **R:** 32 / 34 = **0.9412**
- **C:** **1** (S1 only; no CORE corruption)
- **Score:** **6.5 / 10**

CORE contributes 25/26 weighted points: twelve CORE facts are recovered unhedged, while C1 is hedged because the blind reader could identify the purple lane's membership and role but could not read its `API` badge. SECONDARY contributes 7/8: seven facts are recovered, while S1 is corrupted by the confident reconstruction of `poll` as `pull`. The final canvas JSON confirms that the remaining reconstructed directions, endpoints, group assignments, labels, and styles agree with the committed state.

The board clears the 6 row (`R >= 0.75`, `C <= 2`, with narrative and groupings surviving) but cannot qualify for 7 or 8 because C1, a CORE fact, survives only as explicit inference rather than unhedged recovery. The 6.5 half-step reflects near-complete weighted recall above the 6 anchor while retaining the rubric's required drop below 7 for a hedged CORE fact. The CORE-corruption cap does not apply.

## Per-fact scoring

| Fact | Weight | Call | Credit | Reconstruction line(s) settling the call |
|---|---:|---|---:|---|
| C1 | 2 | **hedged** | 1 | `Frontend`, the purple lane, `Data`, `Observability`, and `Workers` are listed and grouped in top-to-bottom sequence, but the reconstruction explicitly says: “The purple lane groups request parsing, authorization, job enqueueing, and result serving; its function appears to be backend request/API handling, but that description is inferred ... because the lane badge is not legible.” Thus the five-lane structure and order survive, but the `API` name is recovered only by an explicit hedge. |
| C2 | 2 | **recovered** | 2 | EDGES states `Submit Form` → `Validate Input`, `Validate Input` → `Show Progress`, and `Show Progress` → `Render Result`, all in the correct direction. |
| C3 | 2 | **recovered** | 2 | “`Validate Input` → `Parse Request` (solid gray, `submit`).” The endpoint and direction are unambiguous; the unreadable lane badge is already captured by C1. |
| C4 | 2 | **recovered** | 2 | EDGES states `Parse Request` → `Auth Check`, `Auth Check` → `Enqueue Job`, and `Enqueue Job` → `Serve Result`; ORDER repeats that the request path continues through those nodes. |
| C5 | 2 | **recovered** | 2 | “`Enqueue Job` → `Job Queue` (orange dashed, `enqueue`).” |
| C6 | 2 | **recovered** | 2 | “`Job Queue` → `Pick Up Job` (orange dashed, `pull`).” Direction, endpoints, and async dashed style are correct, and ORDER identifies this as the work path into the Workers lane. The label mismatch is scored separately under S1. |
| C7 | 2 | **recovered** | 2 | ORDER gives “`Job Queue` → `Pick Up Job` → `Process Data` → `Write Results` → `Results DB`,” and the Workers grouping contains the three required worker nodes. |
| C8 | 2 | **recovered** | 2 | “`Write Results` → `Results DB` (solid gray, `persist`).” |
| C9 | 2 | **recovered** | 2 | “`Results DB` → `Serve Result` (solid gray, `read`).” |
| C10 | 2 | **recovered** | 2 | “`Serve Result` → `Render Result` (solid gray, `response`).” |
| C11 | 2 | **recovered** | 2 | “`Process Data` → `Show Progress` (gray dashed, `status`).” The reconstruction places the source in Workers and target in Frontend and describes the status updates as going “back to `Show Progress`,” recovering the upward skip-lane feedback. |
| C12 | 2 | **recovered** | 2 | “The legend explicitly defines solid edges as synchronous calls and dashed edges as asynchronous handoffs.” |
| C13 | 2 | **recovered** | 2 | NODES says “`Data` lane: `Job Queue`, `Results DB`,” and GROUPS repeats that Data groups those two nodes. |
| S1 | 1 | **corrupted** | 0 | The reconstruction gives `enqueue` correctly but confidently states “`Job Queue` → `Pick Up Job` (orange dashed, `pull`)”; the ground truth and final JSON connection `edge-queue-pick` say `poll`. |
| S2 | 1 | **recovered** | 1 | “`Write Results` → `Results DB` (solid gray, `persist`)” and “`Results DB` → `Serve Result` (solid gray, `read`).” |
| S3 | 1 | **recovered** | 1 | “`Process Data` → `Show Progress` (gray dashed, `status`).” |
| S4 | 1 | **recovered** | 1 | The reconstruction reads the explanatory callout verbatim: “Solid edges are synchronous calls. Dashed edges are async handoffs.” |
| S5 | 1 | **recovered** | 1 | The reconstruction reads the second callout verbatim: “Submit returns immediately; the real work flows through the queue; status streams back to the browser.” |
| S6 | 1 | **recovered** | 1 | Both queue handoffs are reconstructed as orange dashed, while `Process Data` → `Show Progress` is reconstructed as gray dashed; CONVENTIONS also says orange emphasizes the queue path while gray carries status. |
| S7 | 1 | **recovered** | 1 | CONVENTIONS identifies full-width tinted lanes as “cyan frontend, purple request-handling, peach data, light gray observability, and green workers,” substantively recovering the distinct base-lane tint mapping plus the inserted Observability tint. |
| S8 | 1 | **recovered** | 1 | “`Validate Input` → `Parse Request` (solid gray, `submit`)” and “`Serve Result` → `Render Result` (solid gray, `response`).” |

## Corruption check

The only contradicted fact is S1's `pull`/`poll` label. The final canvas JSON confirms the ground-truth topology for all CORE relations, including Workers→Data persistence, Data→API read, API→Frontend response, and Workers→Frontend status. No CORE fact is corrupted, so the score is not capped at 6.
