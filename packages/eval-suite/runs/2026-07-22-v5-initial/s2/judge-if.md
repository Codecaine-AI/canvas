# IF — Intent Fidelity

- Scenario: `s2-branching-flowchart`
- Run: `2026-07-22-v5-initial`
- Pass fraction: **P = 41/42 = 0.9762**
- Rubric mapping: **9** (`P >= 0.97`; a 10 requires `P = 1.00`)
- Caps applied: **none**. `IF-14` is an absent specced edge, but the stage0 commit summary explicitly declares the arrow-shape substitution, so the silent-absence cap does not apply. No reversed edge or destroyed confirmed content is evidenced.
- **Score: 9/10**

## Per-item verdicts

- **IF-01 — PASS.** JSON object `seed-start` is a gray pill labeled `Order received`.
- **IF-02 — PASS.** JSON object `order-valid` is an orange `decision` labeled `Order valid?`.
- **IF-03 — PASS.** JSON object `request-correction` is a gray process labeled `Request correction`.
- **IF-04 — PASS.** JSON object `charge-payment` is a gray process labeled `Charge payment`.
- **IF-05 — PASS.** JSON object `in-stock` is an orange `decision` labeled `In stock?`.
- **IF-06 — PASS.** JSON object `create-backorder` is a gray process labeled `Create backorder`.
- **IF-07 — PASS.** JSON object `await-restock` is a gray process labeled `Await restock`.
- **IF-08 — PASS.** JSON object `pick-pack` is a gray process labeled `Pick & pack`.
- **IF-09 — PASS.** JSON object `seed-end` is a green pill labeled `Order shipped`.
- **IF-10 — PASS.** JSON object `order-refunded` is a red pill labeled `Order refunded`.
- **IF-11 — PASS.** JSON connection `edge-new-order` runs `seed-start` -> `order-valid`, is labeled `new order`, and is solid gray with a forward arrow.
- **IF-12 — PASS.** JSON connection `edge-valid-yes` runs `order-valid` -> `charge-payment`, is labeled `Yes`, and is solid gray with a forward arrow.
- **IF-13 — PASS.** JSON retains `edge-valid-no` at `order-valid` -> `request-correction` with label `No`; the E2 summary identifies it as an existing edge changed to dashed red, establishing that its build-state style was the requested solid style.
- **IF-14 — FAIL.** The JSON `connections` array contains no connection from `request-correction` -> `order-valid`. Instead, JSON contains an unconnected object `resubmitted-arrow` of type `arrow-shape`, and the PNG visibly shows it as a free-standing right-pointing arrow above the two nodes rather than an attached feedback edge. The stage0 commit summary declares this substitution because anti-parallel routed connectors overlap, so this failure is not silent and does not trigger the cap.
- **IF-15 — PASS.** JSON connection `edge-charged` runs `charge-payment` -> `in-stock`, is labeled `charged`, and is solid gray with a forward arrow.
- **IF-16 — PASS.** JSON retains `edge-charge-declined` at `charge-payment` -> `order-refunded` with its exact label; the E2 summary identifies it as an existing edge changed from the build style to dashed red.
- **IF-17 — PASS.** JSON connection `edge-stock-yes` runs `in-stock` -> `pick-pack`, is labeled `Yes`, and is solid gray with a forward arrow.
- **IF-18 — PASS.** JSON connection `edge-stock-no` runs `in-stock` -> `create-backorder`, is labeled `No`, and remains solid gray with a forward arrow.
- **IF-19 — PASS.** JSON connection `edge-queued` runs `create-backorder` -> `await-restock`, is labeled `queued`, and is solid gray with a forward arrow.
- **IF-20 — PASS.** JSON connection `edge-stock-arrived` runs `await-restock` -> `pick-pack`, is labeled `stock arrived`, and is solid gray with a forward arrow.
- **IF-21 — PASS.** JSON retains `edge-restock-expired` at `await-restock` -> `order-refunded` with its exact label; the E2 summary identifies it as an existing edge changed from the build style to dashed red.
- **IF-22 — PASS.** JSON connection `edge-handed-carrier` runs `pick-pack` -> `seed-end`, is labeled `handed to carrier`, and is solid gray with a forward arrow.
- **IF-23 — PASS.** In the PNG, `Order valid?` has legible, edge-associated `Yes` and `No` chips, and `In stock?` has legible, edge-associated `Yes` and `No` chips.
- **IF-24 — PASS.** JSON object `refund-note` is a sticky containing both required ideas, and the PNG places it in the lower margin directly beside the refund-side flow and `Order refunded` terminal.
- **IF-25 — PASS.** JSON has no semantic section beyond the fixture-required locked `page-frame`; all ordinary build processes are gray, while decisions and terminals use their requested special colors. The only later-added process exception is the explicitly requested violet `Fraud review`.
- **IF-NEG-1 — PASS.** Every specced node is present and every specced edge is present except e4; the e4 arrow-shape substitution is explicitly declared in the stage0 commit summary, so there is no silent omission.
- **IF-NEG-2 — PASS.** JSON contains only the required page frame, specced nodes/edges/note, and the declared `resubmitted-arrow` substitution; there are no undeclared extra nodes, semantic sections, or connections.
- **E1-01 — PASS.** JSON object `fraud-review` is a violet process labeled `Fraud review`.
- **E1-02 — PASS.** JSON connection `edge-fraud-flagged` runs `order-valid` -> `fraud-review`, is labeled `Flagged`, and is solid violet with a forward arrow.
- **E1-03 — PASS.** JSON connection `edge-fraud-cleared` runs `fraud-review` -> `charge-payment`, is labeled `cleared`, and is solid violet with a forward arrow.
- **E1-04 — PASS.** JSON retains `edge-fraud-confirmed` at `fraud-review` -> `order-refunded` with label `confirmed fraud`; the E2 summary confirms this existing originally violet/solid fraud edge was then intentionally restyled dashed red.
- **E1-05 — PASS.** Final JSON retains the pre-existing node labels/colors, unaffected edge labels/styles/colors, red and green terminals, and exact sticky text; the only later differences are the four styles/colors expressly requested by E2.
- **E2-01 — PASS.** JSON `edge-valid-no` is dashed red, labeled `No`, and still runs `order-valid` -> `request-correction`.
- **E2-02 — PASS.** JSON `edge-charge-declined` is dashed red, retains its exact label, and retains `charge-payment` -> `order-refunded` endpoints.
- **E2-03 — PASS.** JSON `edge-restock-expired` is dashed red, retains its exact label, and retains `await-restock` -> `order-refunded` endpoints.
- **E2-04 — PASS.** JSON `edge-fraud-confirmed` is dashed red, retains its exact label, and retains `fraud-review` -> `order-refunded` endpoints.
- **E2-05 — PASS.** JSON `resubmitted-arrow` remains gray and `edge-stock-no` remains solid gray; neither was incorrectly included in the dashed-red failure family.
- **E2-06 — PASS.** The final JSON contains exactly one instance of each restyled connection and no parallel duplicate; the E2 run note states connection count was unchanged and only the four named existing edge IDs were updated.
- **E3-01 — PASS.** The E3 commit summary and run note record that only `await-restock` moved downward by 48 px, within the accepted 32–48 px range; final JSON places it at `y: 1008`.
- **E3-02 — PASS.** The E3 summary says `x` was unchanged, and final JSON retains `x: 1536`, size `224 x 112`, gray color, and label `Await restock`.
- **E3-03 — PASS.** Final JSON keeps `edge-queued`, `edge-stock-arrived`, and `edge-restock-expired` attached to `await-restock` with the correct other endpoints, exact labels, and required styles/colors; the E3 run note confirms all connections remained byte-identical.
- **E3-04 — PASS.** In the final PNG, the `stock arrived` chip is legible on the vertical rejoin edge below `Pick & pack`, with clear separation from the horizontal `Pick & pack` corridor.

## Result

One of 42 items fails, so **P = 41/42 = 0.9762**. The rubric maps this to **9/10**. No cap applies because the only missing specced edge was replaced via an honestly declared substitution rather than silently omitted.
