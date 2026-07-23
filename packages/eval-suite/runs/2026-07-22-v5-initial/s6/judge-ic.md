# IC — Information Comprehension

## Result

- **R:** 23.5 / 29 = **0.8103**
- **C:** **1** corrupted fact
- **CORE corruptions:** **1** (`C8`)
- **Score:** **6 / 10**

The score is 6 because `R = 0.8103` and `C = 1` qualify for the rubric's 6 row. The sole corruption is CORE, so the CORE-corruption override also caps the result at 6.

Final-state normalization: the ground-truth tables say Growth moves from Product to Engineering after E1 and Design gains `n15` after E2; `e3.json` identifies that added Design team as Brand Studio. Accordingly, the final-state versions of C3–C5, C10, and S3 are evaluated with Engineering at five teams, Product at one, Design at two, and ten team boxes total.

## Per-fact evidence

| Fact | Weight | Call | Credit | Reconstruction line settling the call |
|---|---:|---|---:|---|
| C1 | 2 | recovered | 2 | `ORDER: Start at the single root executive node at the top. Follow its solid gray branches down to the four peers VP Engineering, VP Product, VP Design, and VP Operations.` “Root executive” substantively recovers CEO despite the unreadable title. |
| C2 | 2 | recovered | 2 | `The four peers VP Engineering, VP Product, VP Design, and VP Operations.` |
| C3 | 2 | recovered | 2 | `Engineering: VP Engineering with Platform, Frontend, Infrastructure, Security, and Growth` — this is the correct post-E1 Engineering subtree. |
| C4 | 2 | recovered | 2 | `Product: VP Product with Insights` — correct after Growth's E1 move. |
| C5 | 2 | recovered | 2 | `Design: VP Design with Design Systems and Brand Studio` — correct after E2. |
| C6 | 2 | hedged | 1 | `VP Operations → Operations child at lower left with illegible label` and `VP Operations → Facilities`; UNCERTAIN explicitly says the lower-left child label cannot be read, so IT is not confidently recovered. |
| C7 | 2 | recovered | 2 | EDGES enumerates one solid VP-to-team edge for every team; GROUPS further says Design Systems belongs to Design `by enclosure and solid reporting line` while the dashed relationship is additional. |
| C8 | 2 | corrupted | 0 | `VP Engineering → Design Systems (orange dashed; dotted-line report)`. Ground truth requires `Design Systems → VP Engineering`; `e3.json` confirms the committed dashed connection is reversed (`seed-vp-engineering` → `team-design-systems`). |
| C9 | 2 | recovered | 2 | `Solid gray = direct report`; `Orange dashed = dotted-line report`. |
| C10 | 2 | recovered | 2 | GROUPS reconstructs final counts directly: Engineering has five teams, Product one, Design two, Operations two; this transmits Engineering as largest and Product as smallest in the final state. |
| C11 | 2 | recovered | 2 | GROUPS assigns each VP and its teams to Engineering, Product, Design, and Operations panels, and CONVENTIONS says `Large pastel panels encode departmental membership`. |
| S1 | 1 | recovered | 1 | `their small tabs are labeled Engineering, Product, Design, and Operations.` |
| S2 | 1 | recovered | 1 | `Teal rounded rectangles represent the root and VP-level roles; smaller gray rounded rectangles represent lower-level teams or functions.` |
| S3 | 1 | missed | 0 | No reconstruction line states that the ten final-state team boxes share one baseline. |
| S4 | 1 | hedged | 0.5 | UNCERTAIN: `A small outlined pill reading "dotted line" appears ... Its exact attachment is unclear ... it appears to be an annotation for that connector.` |
| S5 | 1 | recovered | 1 | `The legend reads: "HOW TO READ"; "Solid gray = direct report"; "Orange dashed = dotted-line report"; "Tinted panels = each VP’s org".` |
| S6 | 1 | recovered | 1 | GROUPS identifies pale cyan, lavender, peach, and green panels; CONVENTIONS identifies four departmental panels. |
| S7 | 1 | missed | 0 | The reconstruction gives top-down order and branching, but never states that each VP is centered over its children or that the CEO is centered over the VP row. |

## Totals

- CORE recovered credit: **19 / 22**
- SECONDARY recovered credit: **4.5 / 7**
- Weighted recovered: **23.5 / 29**
- Corrupted facts: **1** (`C8`, CORE)
