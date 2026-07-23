# Findings — hierarchy / org tree

Canvas: eval-org-tree · Sessions run: 7 · Date: 2026-07-22

## Sessions

### S1 — "Build a 3-level org chart: CEO → 3 VPs → 10 teams on a wide bottom row"
- session/container: 378d7499-ed68-4879-bcb4-9b60e8f06b1a / b97536d9-1e4e-5601-8911-d37c3af45b16
- outcome: committed (propose_program retries: 11 — all syntax rejections before the first solve)
- aesthetic: 3 — subtree structure is genuinely balanced (VPs centered over team rows, one shared bottom register, even 64px sibling gaps) but connector routing is messy (arrows entering leaf sides with hooks, a long awkward CEO→VP Ops elbow) and the requested colors (CEO/VPs blue, teams gray) were silently dropped.
- friction:
  - MECH: DSL expressiveness — BLOCKED — the agent's first instinct was a nested `column`/`row` tree with `gap=`/`align=` attributes; the parser rejected 11 consecutive programs (turns 1–11) before it re-expressed the tree as a flat `group` + compass slots + fans. The natural grammar for a tree is not the language's grammar.
  - R6 fan — PROTECTED — the final `fan dir=S` cascade centered each VP exactly over its children's midpoint and the CEO over the VP midpoint, with an even 832px hub pitch (turn 12 program, image …9df92c0.61.1).
  - MECH: DSL expressiveness — BLOCKED — the layout program has no color vocabulary; the instruction's explicit color assignments never appeared in the ops, with no mention that they were dropped.
  - R2 spacing ladder — NEUTRAL — a 74px CEO↔VP gap was flagged off-ladder; committed anyway, invisible in the render.
  - MECH: lint thresholds — NEUTRAL — a wall of "extends Npx past the frame" warnings measured against the scope bounding box (1088×336, just the two seed nodes), not the board; all noise. This trained the agent to ignore overflow lint, which mattered later when overflow was real (S3, S7).
- process: rendered exactly once (turn 13), committed immediately (turn 14). Single-render habit; the connector mess and dropped colors were visible in that render and not acted on.

### S2 — "Add a fourth VP (Marketing, 2 teams) and rebalance"
- session/container: d1afbb7c-4e46-41bc-9e9a-00e3d6f215c4 / a3e8bb80-69b8-5d8c-a11f-f36b0f5ca556
- outcome: committed (propose_program retries: 2)
- aesthetic: 4 — best result of the run: four symmetric fans, both registers pinned by `align y`, CEO at the exact 4-VP midpoint, twelve leaves on one baseline; docked a point for the top-level CEO fan still entering VP boxes from the sides and hooked arrows in the VP-Eng fan.
- friction:
  - R5 align — PROTECTED — explicit `align y: 2 8 12 15` and a 12-member leaf register kept both rows perfectly flat across all four subtrees (turn 6 program, image …a24f1.37.1).
  - R6 fan — PROTECTED — even hub pitch and hub-over-midpoint held for all five fans.
  - MECH: DSL expressiveness — BLOCKED (minor) — creating nodes via unquoted `text=` tokens produced boxes displaying id-slugs ("vp-marketing-lena-kovacs") in Drafts 1–2; only visible in the render, fixed with quoted text in Draft 3 (turns 3–6).
- process: the one genuine fine-tune loop of the run: draft → render (turn 5) → saw the id-slug labels → re-propose → render again (turn 7) → commit. Looking at the render directly caused a fix.

### S3 — "Tighten level 2→3 vertical gap to ~96px and fit the tree inside the page frame" (+ corrective follow-up)
- session/container: c88ba8bd-0362-4b30-9a2a-be7dae1d7cd7 / 060b6881-cf43-5ad7-904a-adfd76e3ac3f
- outcome: committed after an operator follow-up message (9 drafts total; first proposal would have been rejected)
- aesthetic: 3 — final state has clean rows, correct order, and a properly tightened level step, but the whole tree slid off the left page edge (platform-team at x=-76) and the inter-subtree gaps went 168/272/376px — visibly uneven.
- friction:
  - R2 spacing ladder — BLOCKED — the agent asked for `gap=320` (to pitch the VP row) and `gap=16`; both refused, only 0/32/64/96 exist (turns 16–17). The requested ~96px level gap itself landed at 115px, which lint then flagged off-ladder — the solver's own output fails its own ladder.
  - R4 grid — BLOCKED — the first fix packed each subtree into a `grid 2x2`, which discarded author order (row-major flatten scrambled Platform/Frontend/Infra and Research/Growth) and split the twelve leaves onto two baselines 52px apart. The lattice abstraction destroyed exactly the two properties an org chart needs.
  - R6 fan — BLOCKED — the top-level fan's uniform hub pitch is the only horizontal spread the language can say; compacting into the frame while keeping four subtrees required unequal pitches, so the solver overflowed the frame (right in Draft 5, left in Draft 9) instead.
  - MECH: lint thresholds — NEUTRAL — lint grumbled about off-ladder gaps and frame overflow but never flagged the actual regressions (split baseline, scrambled order); the operator follow-up had to.
- process: rendered three times and did adjust after looking, but committed both proposals with real defects still visible (two-baseline render before the follow-up; left overhang after).

### S4 — fine-grained probe: "shift tree 140px right; nudge each subtree so cluster gaps equal ~168px; change nothing else"
- session/container: b2dd7aca-7f56-4a62-a36e-8eb832072f6f / 33900c2d-1ee1-57e5-9cde-1451dd651da7
- outcome: abandoned (agent self-abandoned; board untouched)
- aesthetic: n/a — no change; the x=-76 overhang and 168/272/376 gaps the probe targeted remained unfixable through the agent.
- friction:
  - R10 language-refusal — BLOCKED — the agent's first real attempt was raw coordinates for all 17 objects: `item 1 … at=(64,685)`; parser: `unknown at= compass "(64,685)"` (turn 2). The exact blind spot R10 documents, hit verbatim by a legitimate request.
  - R2 spacing ladder — BLOCKED — fallback attempt `gap=168` refused; 168 is not a rung (turn 3).
  - MECH: size normalization — BLOCKED — the only solvable draft reclassified sizes on refit (some teams read back as M, VPs as L) and resized 144×72 teams to 200×100 and VPs to 270×135 — directly violating "keep every vertical position exactly as it is" (turn 7).
  - MECH: DSL expressiveness — BLOCKED — no rigid-unit translate exists. The agent's abandon reason states it precisely: "I couldn't express the required exact rigid-unit horizontal offsets while guaranteeing all y-positions and object sizes remain unchanged" (turn 8).
- process: inspected exact geometry up front (it wanted to comply precisely), tried four grammars, never rendered (nothing acceptable to render), abandoned honestly rather than commit a distortion. Good judgment; total intent failure.

### S5 — "connector-quality pass: every reporting line bottom-out/top-in; keep all boxes where they are"
- session/container: fb61d41f-11ff-405e-ba42-59ed4f091bda / 3b23217e-f01f-5c48-b9da-4252c70d34fe
- outcome: abandoned (agent self-abandoned; board untouched)
- aesthetic: n/a — the side-entry arrow mess, the single biggest recurring flaw across every committed render, is not addressable through the agent.
- friction:
  - MECH: DSL expressiveness — BLOCKED — arrows have no port/side syntax (the agent's turn-4 thinking, "Designing arrow port syntax," found none) and there is no connector-only operation: any `arrows` change rides on a full re-layout of the scope.
  - MECH: size normalization — BLOCKED — the fit→expand round trip is not idempotent: re-proposing essentially the fitted program moved boxes ~334–353px and resized VPs to 270×135 (turns 4, 6), so "keep positions" could not survive even a no-op edit.
  - R9 feedback edges — NEUTRAL — the elbow router's freedom to "exit any free side" is what produces the side entries; nothing in the language can forbid it, so it neither protected nor could be corrected.
- process: two solved drafts, both violating the keep-positions constraint; abandoned with an accurate reason (turn 7) instead of committing.

### S6 — "re-lay out so the tree fits fully inside the page frame" (coarse version, attempt 1)
- session/container: c1267de3-77c8-43b3-ac5d-c12d87abddc1 / 7f8e6273-3c1a-5cf1-a653-eaf8baf2b543
- outcome: harness-death — `stream_incomplete: Upstream websocket closed before response.completed` after 4 drafts; no proposal survived. (The studio proxy at :3999 also died during this window; remaining work ran against :4820 direct.)
- aesthetic: n/a
- friction:
  - MECH: DSL expressiveness — BLOCKED — no way to anchor the tree to the frame edge; the agent bisected numerically via `inspect`, landing platform-team at x=20, then overcorrecting to x=-142, still oscillating when the stream died (turns 4, 6).
- process: iterating by `inspect` coordinates rather than renders — precision hunting through a language with no precision.

### S7 — same coarse fit request, retry
- session/container: 2af6c0a5-0f02-4a71-a9e3-0f4b2190eca0 / fc6c1e36-c386-5bcc-89e3-e7627ffea2e4
- outcome: committed (propose_program retries: 4 across 3 drafts)
- aesthetic: 3 — clean three-band structure, correct order, single baseline, CEO centered; but the tree still ends 60px past the right frame edge (events-team right edge 3228 vs frame 3168 — visibly clipped in its own render), and cluster gaps remain 168/272/376.
- friction:
  - R6 fan — PROTECTED — structure integrity held again through a full re-layout (registers, centering, order).
  - R6 fan — BLOCKED — "even breathing room between the four subtrees" was requested twice and is unachievable: the fan can only say one uniform hub pitch, and equal hub pitch with unequal subtree widths mathematically forces unequal cluster gaps.
  - MECH: single-render habit — BLOCKED — rendered once (turn 9) with Events Team clipped at the crop edge and committed anyway (turn 10).
- process: solve → inspect → adjust → render once → commit on first acceptable.

## Rule tally
| rule | PROTECTED | BLOCKED | NEUTRAL | strongest evidence |
|------|-----------|---------|---------|--------------------|
| R2 spacing ladder | 1 | 3 | 1 | S4 t3: `gap=168` refused while probing cluster-gap equalization; S3 t16 `gap=320` refused |
| R4 grid | 0 | 1 | 0 | S3 Draft 5: 2x2 lattices scrambled sibling order and split the leaf baseline 52px |
| R5 align | 2 | 0 | 0 | S2: `align y` held 4 VPs + 12 leaves on two flat registers across all subtrees |
| R6 fan | 3 | 2 | 0 | PROTECTED: every committed render has hubs centered over child midpoints; BLOCKED: uniform hub pitch makes equal cluster gaps (168/272/376) unsayable |
| R9 feedback edges | 0 | 0 | 1 | side-entry elbows are router freedom, neither commandable nor forbidden |
| R10 language-refusal | 0 | 1 | 0 | S4 t2: agent emitted `at=(64,685)` raw coordinates for 17 objects; parser refused verbatim |
| MECH: size normalization | 0 | 2 | 0 | S4/S5: refit reclassified sizes; round trip resized 144×72→200×100, 200×100→270×135 under a "change nothing" instruction |
| MECH: DSL expressiveness | 0 | 6 | 0 | S1 11-reject syntax fight; no color, no rigid translate, no connector-only pass, no frame anchor |
| MECH: lint thresholds | 0 | 0 | 2 | scope-bbox overflow lint cried wolf in S1 (board was fine) and missed the real S3 regressions (split baseline, order scramble) |
| MECH: single-render habit | 0 | 2 | 1 | S1 and S7 committed on first render with visible defects (connector mess; clipped Events Team); S2 is the counterexample where a second look fixed labels |
| MECH: wrecked-layout gate | 0 | 0 | 0 | never fired |
| R1 16px grid | 0 | 0 | 1 | committed coordinates frequently off-grid (y=479, 685; x=172) — scope-frame offset defeats the snap; no visible harm |

## Verdict for this diagram type
For org trees the structural rules earn their keep completely: R6 fan plus R5 align produced correctly centered hubs, flat registers, and even sibling gaps in every committed session — the hard part of a tree, for free. But the same fan rule owns the type's signature residual flaw: uniform hub pitch with unequal subtree widths guarantees unequal gaps between the leaf clusters (168/272/376px here), and the request to equalize them — the most natural org-chart polish there is — died at three different walls (R10 raw-coordinate refusal, R2's closed ladder, and size normalization's non-idempotent round trip), ending in two honest agent abandons. The other systematic gap is connectors: side-entry elbows were the biggest aesthetic drag in every render, and the language has no port syntax and no connector-only operation, so the flaw is permanent. A "render early, adjust freely" loop would have helped at the margins (S2 proves the agent fixes what it sees; S1/S7 committed visible defects after one look), but the dominant failures here were expressiveness, not process — the agent usually knew exactly what it wanted, wrote it, and was refused. The fan-pitch/cluster-gap tension and the parent-child port demand feel specific to hierarchies; the ladder refusals, size-normalization drift, and lint crying wolf about the scope-bbox frame read as universal. If one op were added for this type, it should be per-child pitch overrides (or cluster-gap equalization) on `fan`, exactly in the spirit of R10's own suggestion of register offsets on `align`.
