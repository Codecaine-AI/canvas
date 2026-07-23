# S8 — RAG retrieval architecture comparison

<!-- Fixture contract: this file alone must be enough to (a) run the scenario from a blank
canvas and get a comparable board every time, and (b) grade all five axes. The build
instruction is the canonical source of intent; every table below restates the instruction
precisely — the checklist may never demand anything the instruction doesn't ask for. -->

- id: `s8-retrieval-designs`
- canvas: `eval-suite-s8-retrieval-designs` (created fresh every run; delete any existing first)
- genre: composite: comparative design board (intent-classification-2 class, fresh domain)
- complexity: 5
- board: 3200×1800 locked `page-frame`
- session budget: 1 build session + 3 edit sessions, 15 min poll cap each
- scale: 27 objects (22 nodes + 2 in-panel notes + 1 margin sticky + 2 sections), 26 edges at build; E1 adds 1 node + 1 edge, E2 adds 1 edge
- spec decision (declared): per-panel terminals, not a shared one — a shared terminal would visually merge the two alternatives and defeat the board's framing

## Build instruction (verbatim — send exactly this)

> Build a comparison board: two alternative RAG retrieval architectures for the same job, side by side. Frame is 3200×1800, locked. The whole point of this board is that a reader instantly sees ONE shared entry funnel feeding TWO peer alternatives — not one long pipeline. Composition sells that or nothing does.
>
> Shared entry, top-center, outside both panels: "User Query" (green) flows into "Query Understanding" — make Query Understanding a distinct funnel/trapezoid shape in red so it reads as the intake. Feed Query Understanding from three tan context boxes stacked beside it: "Chat History", "User Profile", "Domain Glossary" — each with a green feeder arrow into Query Understanding.
>
> From Query Understanding, two red branch arrows — one into each panel. Red is reserved for the entry: nothing else on the board is red except the funnel and these two branches.
>
> LEFT panel — a tinted section titled "Single-Stage Retrieval" (neutral gray tint): "Embed Query" (teal) → "Vector Search" (teal) → "Top-k Rerank" (teal) → "Answer Synthesis" (pink) → "Response to User" (green terminal, inside the panel). Under "Vector Search", a centered fan of three violet corpus shards: "Shard A", "Shard B", "Shard C", with teal fan arrows from Vector Search down to each shard. Inside the panel, a tan annotation note: "Good for small corpora — a single hop keeps latency low."
>
> RIGHT panel — a tinted section titled "Multi-Stage Retrieval" (same neutral gray tint): "Query Decomposition" (teal) fans with orange arrows into two orange sub-query nodes, "Sub-query A" and "Sub-query B". Each sub-query flows (orange) to its own violet retriever: Sub-query A → "Retriever A", Sub-query B → "Retriever B". Both retrievers → "Fusion Ranker" (teal), each of those two edges labeled "results". Then Fusion Ranker → "Answer Synthesis" (pink) → "Response to User" (green terminal, inside the panel). Also in this panel: a gray decision diamond "Mode Router (sparse vs dense)" fed from Query Decomposition by a solid gray edge labeled "route plan"; the router advises each retriever with a dashed gray arrow — to Retriever A labeled "dense", to Retriever B labeled "sparse". Tan annotation note inside the panel: "Good for complex, multi-part questions — trades latency for recall."
>
> Cross-panel same-role links: dashed neutral gray, visually distinct from every flow arrow: one between the two "Answer Synthesis" nodes labeled "same role", and one between "Vector Search" and "Fusion Ranker" labeled "retrieval core". These say "these two components do the same job in each alternative" — they are not data flow.
>
> One tan margin sticky in the lower margin, outside both panels: "Tradeoff: single-stage is cheap and fast, but quality caps at one retrieval hop. Multi-stage wins on compound questions at the cost of moving parts. Pick per corpus size and query complexity."
>
> Composition standards: the two panels must read as equal-weight peers — same tint, similar visual mass, each with its own terminal. Fans centered under their hubs. Every label owns air; no junction machinery; house reference finish.

## Ground truth

### Nodes

| ref | label (verbatim) | kind/shape | color-class | notes |
|---|---|---|---|---|
| n1 | User Query | process | green | top-center, outside panels |
| n2 | Query Understanding | funnel/trapezoid | red | the intake; distinct shape, outside panels |
| n3 | Chat History | context box | tan | stacked beside n2, outside panels |
| n4 | User Profile | context box | tan | stacked beside n2, outside panels |
| n5 | Domain Glossary | context box | tan | stacked beside n2, outside panels |
| n6 | Embed Query | process | teal | in secL |
| n7 | Vector Search | process | teal | in secL; fan hub; cross-link anchor |
| n8 | Shard A | leaf | violet | in secL, fan child of n7 |
| n9 | Shard B | leaf | violet | in secL, fan child of n7 |
| n10 | Shard C | leaf | violet | in secL, fan child of n7 |
| n11 | Top-k Rerank | process | teal | in secL |
| n12 | Answer Synthesis | process | pink | in secL; cross-link anchor |
| n13 | Response to User | terminal | green | in secL |
| n14 | Query Decomposition | process | teal | in secR; fan hub |
| n15 | Sub-query A | process | orange | in secR |
| n16 | Sub-query B | process | orange | in secR |
| n17 | Mode Router (sparse vs dense) | decision diamond | gray | in secR |
| n18 | Retriever A | process | violet | in secR |
| n19 | Retriever B | process | violet | in secR |
| n20 | Fusion Ranker | process | teal | in secR; cross-link anchor |
| n21 | Answer Synthesis | process | pink | in secR; cross-link anchor (same label as n12, deliberate) |
| n22 | Response to User | terminal | green | in secR (same label as n13, deliberate) |

<!-- ref is a stable handle for this file (n1, n2…) — the agent chooses its own ids. -->

### Edges

| ref | from → to | label | style | color-class | notes |
|---|---|---|---|---|---|
| e1 | n1 → n2 | — | solid | gray | entry |
| e2 | n3 → n2 | — | solid | green | feeder |
| e3 | n4 → n2 | — | solid | green | feeder |
| e4 | n5 → n2 | — | solid | green | feeder |
| e5 | n2 → n6 | — | solid | red | branch into left panel |
| e6 | n2 → n14 | — | solid | red | branch into right panel |
| e7 | n6 → n7 | — | solid | teal | left spine |
| e8 | n7 → n8 | — | solid | teal | fan |
| e9 | n7 → n9 | — | solid | teal | fan |
| e10 | n7 → n10 | — | solid | teal | fan |
| e11 | n7 → n11 | — | solid | teal | left spine |
| e12 | n11 → n12 | — | solid | teal | left spine |
| e13 | n12 → n13 | — | solid | teal | left spine to terminal |
| e14 | n14 → n15 | — | solid | orange | right fan |
| e15 | n14 → n16 | — | solid | orange | right fan |
| e16 | n14 → n17 | route plan | solid | gray | into router |
| e17 | n17 → n18 | dense | dashed | gray | advisory |
| e18 | n17 → n19 | sparse | dashed | gray | advisory |
| e19 | n15 → n18 | — | solid | orange | sub-query to its retriever |
| e20 | n16 → n19 | — | solid | orange | sub-query to its retriever |
| e21 | n18 → n20 | results | solid | teal | into fusion |
| e22 | n19 → n20 | results | solid | teal | into fusion |
| e23 | n20 → n21 | — | solid | teal | right spine |
| e24 | n21 → n22 | — | solid | teal | right spine to terminal |
| x1 | n12 ↔ n21 | same role | dashed | gray | cross-panel; non-flow (arrowless if supported, else direction declared in commit summary) |
| x2 | n7 ↔ n20 | retrieval core | dashed | gray | cross-panel; non-flow (same convention as x1) |

### Sections / groups

| ref | title | tint | members (node refs) | nesting |
|---|---|---|---|---|
| secL | Single-Stage Retrieval | gray | n6, n7, n8, n9, n10, n11, n12, n13, a1 | top-level, left half |
| secR | Multi-Stage Retrieval | gray | n14, n15, n16, n17, n18, n19, n20, n21, n22, a2 | top-level, right half |

### Annotations

| ref | kind | gist | placement |
|---|---|---|---|
| a1 | tan note | "Good for small corpora — a single hop keeps latency low." | inside secL, clear of the pipeline |
| a2 | tan note | "Good for complex, multi-part questions — trades latency for recall." | inside secR, clear of the pipeline |
| st1 | tan margin sticky | "Tradeoff: single-stage is cheap and fast, but quality caps at one retrieval hop. Multi-stage wins on compound questions at the cost of moving parts. Pick per corpus size and query complexity." | lower margin, outside both panels |

## Comprehension key

CORE:
- [C1] The board compares TWO ALTERNATIVE architectures for the same job — a reader recovers that the panels are peer options, not stages of one pipeline. (This is the board's reason to exist; a reconstruction that chains the panels into one flow has corrupted it.)
- [C2] The shared entry is User Query → Query Understanding.
- [C3] Query Understanding is fed by three context sources: Chat History, User Profile, Domain Glossary.
- [C4] The entry branches into BOTH panels — both alternatives consume the same understood query.
- [C5] Left alternative order: Embed Query → Vector Search → Top-k Rerank → Answer Synthesis → Response to User.
- [C6] Vector Search fans out to three corpus shards (Shard A/B/C) — the shards are children of the search, not pipeline stages.
- [C7] Right alternative starts with Query Decomposition splitting into two sub-queries (Sub-query A, Sub-query B).
- [C8] Each sub-query has its OWN retriever (A→Retriever A, B→Retriever B) — parallel, not shared.
- [C9] Both retrievers' results merge at the Fusion Ranker before Answer Synthesis.
- [C10] The Mode Router decides sparse vs dense per retriever (advisory: "dense" to Retriever A, "sparse" to Retriever B), and its advice is dashed — not data flow.
- [C11] The dashed cross-panel links mark SAME-ROLE components across the alternatives (the two Answer Synthesis nodes; Vector Search ↔ Fusion Ranker as the retrieval cores) — they are not data flow.
- [C12] The left alternative is positioned for small corpora / low latency; the right for complex multi-part questions / recall (annotation gists recovered and attached to the correct panels).
- [C13] Each panel ends in its own Response to User terminal — the alternatives never re-merge.

SECONDARY:
- [S1] The three context feeders arrive on green arrows.
- [S2] The branch arrows out of Query Understanding are red, and red appears nowhere else but the funnel + branches.
- [S3] Query Understanding is a distinct funnel/trapezoid shape.
- [S4] Shard labels are verbatim Shard A, Shard B, Shard C.
- [S5] Both edges into the Fusion Ranker are labeled "results".
- [S6] The router's advisories are labeled "dense" and "sparse", and the router is fed by an edge labeled "route plan".
- [S7] The margin sticky's tradeoff gist is recoverable (cheap/fast vs recall/moving-parts, pick per corpus and complexity).
- [S8] The two panels share the same neutral tint and read as equal visual weight.
- [S9] The two Answer Synthesis nodes are the pink pair — same color, same role.

## Intent-fidelity checklist

Shared entry:
- [ ] IF-EN-01 node n1 exists, label "User Query", green, outside both sections
- [ ] IF-EN-02 node n2 exists, label "Query Understanding", funnel/trapezoid shape, red, outside both sections
- [ ] IF-EN-03 nodes n3 "Chat History", n4 "User Profile", n5 "Domain Glossary" exist, tan, stacked beside n2, outside both sections
- [ ] IF-EN-04 edge e1 n1 → n2 exists
- [ ] IF-EN-05 edges e2, e3, e4 (each context box → n2) exist, solid green, direction INTO n2
- [ ] IF-EN-06 edge e5 n2 → n6 exists, solid red
- [ ] IF-EN-07 edge e6 n2 → n14 exists, solid red
- [ ] IF-EN-08 red appears on exactly n2, e5, e6 and nowhere else

Left panel — Single-Stage Retrieval:
- [ ] IF-L-01 section secL exists, title "Single-Stage Retrieval", gray tint, occupying the left half
- [ ] IF-L-02 secL members exactly {n6, n7, n8, n9, n10, n11, n12, n13, a1}
- [ ] IF-L-03 node n6 "Embed Query" teal; n7 "Vector Search" teal; n11 "Top-k Rerank" teal
- [ ] IF-L-04 node n12 "Answer Synthesis" pink; n13 "Response to User" green terminal inside the panel
- [ ] IF-L-05 nodes n8 "Shard A", n9 "Shard B", n10 "Shard C" exist, violet
- [ ] IF-L-06 spine edges e7 (n6→n7), e11 (n7→n11), e12 (n11→n12), e13 (n12→n13) exist, solid teal, correct order
- [ ] IF-L-07 fan edges e8, e9, e10 (n7 → each shard) exist, solid teal
- [ ] IF-L-08 the shard fan is centered under n7 (PNG check)
- [ ] IF-L-09 note a1 present in-panel, tan, gist "good for small corpora — single hop keeps latency low"

Right panel — Multi-Stage Retrieval:
- [ ] IF-R-01 section secR exists, title "Multi-Stage Retrieval", gray tint, occupying the right half
- [ ] IF-R-02 secR members exactly {n14, n15, n16, n17, n18, n19, n20, n21, n22, a2}
- [ ] IF-R-03 node n14 "Query Decomposition" teal; n20 "Fusion Ranker" teal
- [ ] IF-R-04 nodes n15 "Sub-query A", n16 "Sub-query B" exist, orange
- [ ] IF-R-05 nodes n18 "Retriever A", n19 "Retriever B" exist, violet
- [ ] IF-R-06 node n17 "Mode Router (sparse vs dense)" exists, decision-diamond shape, gray
- [ ] IF-R-07 node n21 "Answer Synthesis" pink; n22 "Response to User" green terminal inside the panel
- [ ] IF-R-08 fan edges e14 (n14→n15), e15 (n14→n16) exist, solid orange, fan centered under n14 (PNG check)
- [ ] IF-R-09 edges e19 (n15→n18), e20 (n16→n19) exist, solid orange — each sub-query to its OWN retriever, no crossing of assignments
- [ ] IF-R-10 edge e16 n14 → n17 exists, label "route plan", solid gray
- [ ] IF-R-11 edge e17 n17 → n18 exists, label "dense", DASHED gray
- [ ] IF-R-12 edge e18 n17 → n19 exists, label "sparse", DASHED gray
- [ ] IF-R-13 edges e21 (n18→n20), e22 (n19→n20) exist, solid teal, EACH labeled "results"
- [ ] IF-R-14 spine edges e23 (n20→n21), e24 (n21→n22) exist, solid teal
- [ ] IF-R-15 note a2 present in-panel, tan, gist "good for complex multi-part questions — trades latency for recall"

Cross-panel links:
- [ ] IF-X-01 link x1 between n12 and n21 exists, dashed gray, labeled "same role"
- [ ] IF-X-02 link x2 between n7 and n20 exists, dashed gray, labeled "retrieval core"
- [ ] IF-X-03 x1 and x2 are visually distinct from flow arrows (dashed neutral; arrowless if the surface supports it, otherwise the chosen direction is declared in the commit summary)

Annotations & composition:
- [ ] IF-AN-01 margin sticky st1 present, tan, tradeoff gist as specced, lower margin outside both panels
- [ ] IF-CP-01 the two panels sit side by side with the shared entry above/between them, and read as equal-weight peers: same tint, comparable visual mass (PNG check)
- [ ] IF-CP-02 the panels do not overlap each other or the entry cluster

Negative checks:
- [ ] IF-NEG-1 no specced node/edge/section/annotation absent without a declared substitution in a commit summary
- [ ] IF-NEG-2 no unrequested structural content (nodes/sections/edges beyond spec + declared substitutions)
- [ ] IF-NEG-3 no edge connects the two panels other than x1, x2 (and E2's x3 once accepted) — in particular NO flow edge chains left panel into right
- [ ] IF-NEG-4 no routing machinery: no junction glyphs, no arrowheads terminating into waypoints, no floating badges
- [ ] IF-NEG-5 dashed styling appears only on e17, e18, x1, x2 (and E2's x3 once accepted) — dashed = advisory/same-role convention holds

## Follow-up edits

### E1 — Fourth shard on the left

Instruction (verbatim):

> Add a fourth corpus shard, "Shard D", under Vector Search on the left — re-center the fan so all four shards sit symmetric under the hub. The right panel is frozen: do not touch it.

Fidelity checks (append to the running IF checklist):
- [ ] E1-01 node n23 exists, label "Shard D", violet, inside secL
- [ ] E1-02 edge e25 n7 → n23 exists, solid teal, matching the existing fan style
- [ ] E1-03 the four-shard fan is centered/symmetric under n7 (PNG check)

Stability invariants (ES):
- [inv] secR and every member (n14–n22, a2) and every right-panel edge (e14–e24): completely unchanged in the JSON diff — zero movement, zero restyle; the instruction says frozen, so even ≤16px drift is a violation here
- [inv] shared entry (n1–n5, e1–e6) unchanged
- [inv] cross links x1, x2: endpoints, style, label unchanged (routes may flex only if an endpoint-side shard shift forces it — declare it)
- [inv] left spine n6, n11, n12, n13 within 16px; secL may grow only if needed and only as a declared accommodation
- [inv] shards n8, n9, n10 may re-space to center the fan (in-scope), but stay inside secL and on the same register as each other and n23
- in-scope objects: n23, e25 (new); n8, n9, n10 (fan re-spacing); secL bounds (declared growth only)

### E2 — Third same-role link

Instruction (verbatim):

> Link the two "Response to User" terminals with the same dashed neutral same-role convention, labeled "same role" — without disturbing either panel's layout.

Fidelity checks (append):
- [ ] E2-01 link x3 between n13 and n22 exists, dashed gray, labeled "same role", matching x1's convention
- [ ] E2-02 x3's label owns air and does not collide with st1, panel borders, or other edges (PNG check)

Stability invariants (ES):
- [inv] every node, section, note, and sticky: position within 16px, no restyle/relabel/re-parent
- [inv] every pre-existing edge: route, style, label unchanged
- [inv] x1 and x2 unchanged
- in-scope objects: x3 only (new)

### E3 — Panel rebalance

Instruction (verbatim):

> The right panel has grown taller than the left — rebalance both panels so they read as equal-weight alternatives.

Fidelity checks (append):
- [ ] E3-01 after-state: the two panels are within ~10% of each other in height and read as equal visual weight side by side (PNG check)
- [ ] E3-02 both panels' interior compositions still satisfy IF-L-08/E1-03 (centered fans) and IF-CP-02 (no overlaps)
- [ ] E3-03 no new dead band inside either panel — interiors re-spaced, not just borders resized

Stability invariants (ES) — geometry-only:
- [inv] panel membership frozen: no node, note, or sticky changes section; object count identical before/after
- [inv] topology frozen: no edge added, removed, relabeled, restyled, or re-endpointed
- [inv] no label text or color-class changes anywhere
- [inv] the shared entry cluster (n1–n5) moves only as a declared accommodation (e.g. panels grew upward), otherwise stays put
- [inv] cross links x1–x3 keep endpoints, style, labels (routes may follow their endpoints)
- in-scope objects: everything inside secL and secR plus the two section frames, geometrically; nothing non-geometric is in scope

## Grading notes

- **The two-alternatives framing is the board's CORE fact.** The worst failure mode is composing the panels so the blind judge reads left→right as one pipeline (e.g. a flow-styled link between panels, or the branch arrows de-emphasized until the entry looks like it feeds only one panel). That is a corrupted CORE fact: IC capped at 6. The reference (intent-classification-2) sells the framing with symmetric tinted panels under a single visible fork — anchor against it.
- **Dashed conventions carry double duty here** (router advisories in-panel, same-role links cross-panel; both gray). A judge should check the *labels* disambiguate them ("dense"/"sparse" vs "same role"/"retrieval core") rather than penalizing the shared style — the spec chose it. But a same-role link rendered as a solid arrow is both an IF style fail and an IC corruption hazard (reads as data flow).
- **Junction-glyph machinery leakage:** fans (n7's shards, n14's sub-queries) and the two-into-one merge at the Fusion Ranker are exactly where crosshair junctions and waypoint-terminating arrowheads appeared in round 1. References show none. Unrequestedness → IF-NEG-4; ugliness → SQ sub-check 5.
- **Labels drifting from their runs:** "results" ×2, "dense"/"sparse", and the cross-link labels are short chips on short runs in a dense panel — the drift risk is a chip sitting between two candidate edges. Drifted chip = IF fail (label not legible as belonging to its edge) and likely IC corruption.
- **Panel tint misuse:** the spec deliberately gives both panels the SAME neutral tint (peer-ness). Do not penalize the repetition as color monotony — it's requested (a user-requested restrained palette is not monotony, per axes/sq.md sub-check 4). DO penalize a node sitting visually outside its panel's tint, or panels whose bounds crop their own annotation notes.
- **Duplicate labels are deliberate:** two "Answer Synthesis" nodes and two "Response to User" nodes are specced verbatim. A blind-judge reconstruction that merges them into single nodes indicates the composition failed to keep the panels distinct — score that through IC, not IF.
- **E3 direction:** the instruction asserts the right panel is the taller one; if a given run's board actually has the imbalance reversed, the edit still means "equalize the panels" — grade the equalization outcome (E3-01), not the literal direction claim. An agent that answers "they are already balanced" with rendered evidence is an honest refusal: ES unscored, IF items fail, PH credits honesty (axes/es.md).
- **Round-1 habit (scorecard.md, cross-cutting): agents commit defects they have already seen.** Every low-scoring round-1 commit shipped a defect visible in the agent's own render. PH judges: the likely seen-and-shipped defects here are branch arrows crossing the context-feeder stack, and cross-link labels colliding with panel borders — check the transcript for a render showing them and no subsequent fix or declaration (PH ≤ 4 class if silent).
- **Do NOT double-penalize declared substitutions** (e.g. "trapezoid unsupported, used a tagged hexagon", "arrowless connectors unsupported, x-links drawn left→right and declared") — the item fails, no silent-omission cap, PH credits the declaration.
