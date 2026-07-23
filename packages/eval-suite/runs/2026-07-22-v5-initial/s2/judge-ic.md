# IC — Information Comprehension

## Result

- **R:** 32.5 / 36 = **0.9028**
- **C:** **0**
- **Score:** **6.5 / 10**

CORE contributes 25/28: 11 facts are recovered and 3 are hedged, so the weighted credit is `(11 × 2) + (3 × 1) = 25`. SECONDARY contributes 7.5/8: 7 facts are recovered and 1 is hedged, so the weighted credit is `7 + 0.5 = 7.5`. No reconstructed claim contradicts the ground truth or the final-canvas corruption check.

The board clears the score-6 thresholds with high recall and no corruption, but it cannot qualify for 7 or 8 because C3, C5, and C14 are CORE facts recovered with explicit uncertainty rather than unhedged. A 6.5 reflects its R above 0.90 and C=0 while enforcing the unhedged-CORE gate, consistent with the axis's calibration note for a high-R reconstruction blocked by CORE ambiguity.

## Per-fact evidence

| Fact | Weight | Call | Reconstruction line(s) settling the call |
|---|---:|---|---|
| C1 | 2 | recovered | `TOPIC` says the board is “A branching order-processing flowchart” following an order “from receipt,” and `ORDER` 1 says, “Start at Order received.” |
| C2 | 2 | recovered | `EDGES` gives `Order valid?` → `Request correction` (`No`) and `Order valid?` → `Charge payment` (`Yes`); `ORDER` 2 describes the two exits distinctly. |
| C3 | 2 | hedged | `EDGES` states `Order valid?` → `Charge payment` (`Yes`), but `UNCERTAIN` says the `Yes` and `cleared` routes overlap and only “support the two edges listed above,” with no marked merge point. |
| C4 | 2 | recovered | `EDGES` states `Order valid?` → `Request correction` (`No`), and `ORDER` 2 repeats that “No goes left to Request correction.” |
| C5 | 2 | hedged | `ORDER` 2 reconstructs the correction/resubmission loop, but `UNCERTAIN` says the arrow “floats above the two boxes,” is not visibly attached, and its endpoint attribution is supported only by direction and placement. |
| C6 | 2 | recovered | `EDGES` states `Charge payment` → `In stock?` (`charged`); `ORDER` 4 repeats that charged proceeds to the stock decision. |
| C7 | 2 | recovered | `EDGES` states `Charge payment` → `Order refunded` (`charge declined`); `ORDER` 4 calls refund the declined-charge endpoint. |
| C8 | 2 | recovered | `EDGES` states `In stock?` → `Pick & pack` (`Yes`), repeated in `ORDER` 5. |
| C9 | 2 | recovered | `EDGES` gives `In stock?` → `Create backorder` (`No`) and `Create backorder` → `Await restock` (`queued`); `ORDER` 5 reconstructs the sequence. |
| C10 | 2 | recovered | `EDGES` states `Await restock` → `Pick & pack` (`stock arrived`), and `ORDER` 6 explicitly says it “rejoins the main fulfillment line at Pick & pack.” |
| C11 | 2 | recovered | `EDGES` states `Await restock` → `Order refunded` (`restock window expired`), repeated in `ORDER` 6. |
| C12 | 2 | recovered | `EDGES` states `Pick & pack` → `Order shipped` (`handed to carrier`); `ORDER` 7 calls `Order shipped` the endpoint, and `GROUPS` calls it the successful outcome. |
| C13 | 2 | recovered | `GROUPS` identifies `Order refunded` as the exception/failure terminal, while `CONVENTIONS` says terminal outcomes are capsules with `Order refunded` coral/red. |
| C14 | 2 | hedged | `EDGES` reconstructs `Order valid?` → `Fraud review` (`Flagged`), `Fraud review` → `Charge payment` (`cleared`), and `Fraud review` → `Order refunded` (`confirmed fraud`). However, `UNCERTAIN` hedges the cleared merge into payment and flags the note's contradiction of the visibly drawn confirmed-fraud refund route. |
| S1 | 1 | hedged | `CONVENTIONS` maps dashed red to the four negative/exception routes, including invalid-order correction, confirmed fraud, declined payment, and expired restock; `UNCERTAIN` says this style meaning is inferred because there is no legend. |
| S2 | 1 | recovered | `EDGES` describes `resubmitted` as a hollow gray arrow and the inventory `No` edge as solid gray, while the dashed-red convention lists neither as part of that family. |
| S3 | 1 | recovered | `CONVENTIONS` says, “Orange boxes are decision points (`Order valid?`, `In stock?`).” |
| S4 | 1 | recovered | `CONVENTIONS` identifies `Order shipped` as the green terminal capsule. |
| S5 | 1 | recovered | `EDGES` states `Order valid?` → `Fraud review` (`Flagged`; solid purple), and `CONVENTIONS` says purple boxes/lines mark the fraud-review detour. |
| S6 | 1 | recovered | `EDGES` gives `Await restock` → `Pick & pack` with label `stock arrived`; `ORDER` 6 identifies it as the rejoin. |
| S7 | 1 | recovered | `EDGES` labels the entry `new order` and the final hop `handed to carrier`; `ORDER` 1 and 7 place both in the narrative. |
| S8 | 1 | recovered | `NODES` transcribes the annotation: “backorders rejoin the line / a refund only happens when / the card declines / or the restock window / lapses.” `UNCERTAIN` also accurately reports its inconsistency with the separate confirmed-fraud edge, without misreading the note itself. |

## Corruption check

The final canvas JSON supports every reconstructed node and all 14 explicit connector relationships. The correction return is represented as a right-pointing `resubmitted` arrow-shape rather than an attached connection, matching the blind judge's explicit hedge instead of creating a corruption. The JSON also confirms the potentially confusing `confirmed fraud` connector from `Fraud review` to `Order refunded`; the reconstruction correctly reports both that edge and the annotation that contradicts it. Therefore **C = 0**, with no corrupted CORE facts and no cap applied.
