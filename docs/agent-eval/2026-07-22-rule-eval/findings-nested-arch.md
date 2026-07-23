# Findings — nested architecture diagram

Canvas: eval-nested-arch · Sessions run: 6 · Date: 2026-07-22

## Sessions

### S1 — "Build nested Production VPC (Edge/Services/Data groups + Event Bus hub, 12 connectors)"
- session/container: c6cfc02e-f987-41ce-b1a8-bbe51bf33cca / b187e92c-49ca-5282-ae38-4e7132a87f7c
- outcome: committed (propose_program retries: 21 consecutive parse failures, turns 1–21; first solved draft turn 22)
- aesthetic: 2 — topology and hub routing correct, but all three group sections were stretched to the full VPC height (592×1616) with 2–4 nodes vertically centered in enormous dead space; the diagram reads as three empty towers.
- friction:
  - MECH: DSL expressiveness — BLOCKED — agent knew the design by turn 1 but spent 21 turns guessing split-weight/gap syntax (`gap=XL`, `1 1 1`, `1,1,1,1`, `1/1/1/1`, `1:1:1`, `[1,1,1,1]`); the working `|`-separated weight form is only discoverable from a fit_scope echo that the trivial baseline didn't contain (turns 1–21).
  - R2 spacing ladder — NEUTRAL — rejected gap "XL" as not-on-ladder (turn 16); vocabulary enforcement, no visual consequence.
  - MECH: solver collapse / nested-section behavior — BLOCKED — declaring groups as a weighted row split stretched every section to the band height instead of hugging content; nobody asked for 1616-tall columns (turn 22 draft, image 2026-07-22T16-12-00-754Z_….101.1).
  - MECH: single-render habit — NEUTRAL — one render (turn 23), immediate commit (turn 24).
- process: looked exactly once and committed the first acceptable draft; no fine-tuning after seeing the stretched columns.

### S2 — "Add Notifications Service inside Services group, wire to gateway and bus"
- session/container: 1babf2e9-f700-4763-a6ea-ea7d72e21860 / da1e14bf-c063-514d-9691-5dd52ac279f4
- outcome: committed (retries: 0 — first propose solved; the fit_scope echo taught it the syntax S1 lacked)
- aesthetic: 3 — new node slots into an even 4×1 column correctly, but its label renders as the raw id "notifications-se rvice" wrapped mid-word, and the Event Bus silently shrank from L (248×130) to M (184×96).
- friction:
  - MECH: DSL expressiveness — BLOCKED — the language has no display-label attribute for new items; `text=` doubles as the object id, so the on-canvas label became "notifications-service" (turn 1 program, image 2026-07-22T16-18-10-555Z_….17.1).
  - MECH: size normalization — BLOCKED — fit_scope re-serialized the existing 248×130 (L) Event Bus as `size=M` (turn 0 echo), so an edit that never mentioned the bus shrank the hub: round-trips are lossy and destroy deliberate emphasis (proposal delta: "Event Bus … resized 248×130 → 184×96").
  - R4 grid — NEUTRAL — 4 same-size services kept as one lattice; harmless here.
- process: single render (turn 2) then commit (turn 3); did not notice or react to the label/id defect visible in its own render.

### S3 — "Shrink every group to hug content, kill the dead space, re-balance left-to-right"
- session/container: 981ab189-bd35-4b7b-8ff9-d07f582a6300 / 5ffa77ab-6148-544d-96d5-f26f9cbf4613
- outcome: committed (retries: 6 parse errors across turns 1–10; 5 solved drafts; 2 renders)
- aesthetic: 3.5 — dead space gone, groups hug with proper header bands, VPC compacted 2640×1776 → 1536×704, clean L-to-R read; residual flaws: head-to-head arrowhead collision between Inventory Service and notifications-service, entry arrows hugging the Data section border, and the compact diagram floats in a mostly-empty locked page-frame.
- friction:
  - R3 section trim — PROTECTED — hug + trim turned stretched towers into properly framed groups (Edge 592×1616 → 320×544 with 64px header band); this rule single-handedly produced the best state of the eval (turns 8–15, image 2026-07-22T16-20-03-341Z_….61.1).
  - R2 spacing ladder — NEUTRAL — rejected gap "24" (turn 2), forced 32; visually equivalent.
  - R4 grid — NEUTRAL — reflowed 4 services into a 2×2 lattice, more compact but created the inter-column arrowhead collisions.
  - R7 hug — PROTECTED — `hug=` placement (after a placement-rule retry, turn 7) kept lanes at natural size instead of re-stretching.
  - MECH: DSL expressiveness — NEUTRAL — 6 more parse errors, all recovered within the session.
- process: the one good loop of the eval — rendered mid-flight (turn 6), kept adjusting through drafts 2–5, rendered again (turn 13), then committed.

### S4 — "Nudge the Event Bus exactly 20px left / 10px up" (fine-grained probe)
- session/container: bf6f4491-74ad-4efe-9ced-6fc3955f362d / 226ade16-a198-5eed-b12f-b57a8bb43196
- outcome: abandoned (retries: 6 invented-syntax attempts, turns 1–8)
- aesthetic: n/a — board untouched.
- friction:
  - R10 language-refusal — BLOCKED — agent tried `offset=(-20,-10)`, `nudge=`, `at=(-20,-10)`, `dx=-20 dy=-10`, `at=C(-20,-10)`, `translate=` then abandoned with: "provides no exact pixel-offset operation, so I can't apply the requested −20px/−10px nudge without risking other layout changes" (turns 1–9).
  - R1 16px grid — BLOCKED — a 20px/10px offset is off-lattice by design; even a hypothetical offset op couldn't say it.
  - MECH: DSL expressiveness — BLOCKED — with only the bus in scope, the solve frame equals the bus's own 184×96 rect, so no in-language placement could move it at all (turn 0 fit_scope).
- process: no render; probed the grammar honestly, inspected occupancy, and refused cleanly rather than silently distorting — the refusal itself is correct behavior given the language.

### S5 — "Fix the 'notifications-service' label; make the Event Bus larger again"
- session/container: 0cce2d99-8919-4cf2-b3f4-ea591bc82dda / c890b507-6955-5364-9852-c606756db755
- outcome: abandoned (retries: 0 — gave up on turn 1)
- aesthetic: n/a — board untouched.
- friction:
  - MECH: DSL expressiveness — BLOCKED — abandon reason verbatim: "this layout editor is prohibited from editing object text, so I can't change 'notifications-service' to 'Notifications Service'". The label defect the DSL itself created in S2 is unfixable in-language.
  - R8 size semantics — NEUTRAL — the bus resize half of the request was expressible (`size=L`) but the agent abandoned all-or-nothing without attempting partial fulfillment (turn 1).
- process: fit_scope, then instant abandon; no render, no partial proposal, no counter-offer.

### S6 — "Tighten vertical spacing inside the Data group; restore Event Bus to size L"
- session/container: d67f6b58-3797-4ba7-bd74-9a0355de36bb / 60dd5cdb-d89a-5632-9884-2aa771c16269
- outcome: agent committed; operator REJECTED (retries: 8 parse errors + 7 solved drafts fighting the same drift)
- aesthetic: 2.5 — the asked-for parts landed (32px Postgres/Redis stack, bus back to 248×130 L), but every one of the 7 drafts pushed the Data section ~164–284px east; the committed draft left it 180px past the frame and ~132px poking outside the Production VPC border.
- friction:
  - MECH: solver collapse / nested-section behavior — BLOCKED — the solver could not tighten the group in place; the row split re-allocated bands and expelled a child section beyond its parent across all 7 drafts (turns 3–15, image 2026-07-22T16-25-57-434Z_….81.1).
  - MECH: lint thresholds — PROTECTED (detection only) — overflow lint correctly flagged all three escapes, but nothing stopped the commit; the wrecked-layout gate never fired.
  - R8 size semantics — PROTECTED — `size=L` cleanly restored hub emphasis, exactly as the vocabulary intends.
  - R2 spacing ladder — NEUTRAL — rejected "gap=M" and "S" tokens (turns 1, 9); forced 32, which was the right value anyway.
- process: rendered once (turn 18) only after 7 drafts, then committed with the overflow lint unresolved; treated lint as advisory.

## Rule tally
| rule | PROTECTED | BLOCKED | NEUTRAL | strongest evidence |
|------|-----------|---------|---------|--------------------|
| R1 16px grid | 0 | 1 | 0 | S4: 20px/10px nudge unrepresentable by design (turns 1–9) |
| R2 spacing ladder | 0 | 0 | 3 | S1 t16 "XL", S3 t2 "24", S6 t1/t9 "M"/"S" — vocab rejections, no visual cost |
| R3 section trim | 1 | 0 | 0 | S3: hug+trim turned 1616-tall empty towers into framed groups (image ….61.1) |
| R4 grid | 0 | 0 | 2 | S2 4×1 column kept; S3 2×2 reflow compact but caused arrowhead collisions |
| R5 align | 0 | 0 | 0 | never fired in any session |
| R6 fan | 0 | 0 | 0 | never detected despite a 5-edge hub — bus sits beside, not above, its peers |
| R7 hug | 1 | 0 | 0 | S3: lanes kept natural size after hug placement retry (t7→t8) |
| R8 size semantics | 2 | 0 | 1 | S6: `size=L` cleanly restored hub emphasis; S3 sizes stable |
| R9 feedback edges | 0 | 0 | 1 | bus→Inventory feedback routed around content but its arrowhead collides head-to-head in S3 |
| R10 language-refusal | 0 | 2 | 0 | S4 abandon: "no exact pixel-offset operation"; S5 abandon: "prohibited from editing object text" |
| MECH: size normalization | 0 | 1 | 0 | S2: fit_scope echoed 248×130 (L) bus as `size=M` → silent shrink on an unrelated edit |
| MECH: wrecked-layout gate | 0 | 0 | 1 | never fired — including S6's child-section-outside-parent commit, where it arguably should have |
| MECH: lint thresholds | 1 | 0 | 0 | S6: overflow flagged 3× — correct detection, zero enforcement |
| MECH: DSL expressiveness | 0 | 4 | 1 | S1: 21-retry grammar fight; S2: label-as-id; S4: scope-frame trap; S5: no text editing |
| MECH: single-render habit | 0 | 0 | 3 | S1/S2/S6 committed after exactly one look; S3 the only look-adjust loop |
| MECH: solver collapse / nested-section | 0 | 2 | 0 | S1: groups stretched to band height; S6: Data section expelled 132px outside its parent VPC |

## Verdict for this diagram type
For nested architecture diagrams the aesthetic rules mostly earned their keep: R3 trim (with R7 hug) is the hero — it alone converted the wrecked first build into the best committed state — and R8's size classes were the one knob that cleanly did what the user meant. The costs were overwhelmingly mechanical, not aesthetic: 35 parse failures across 6 sessions (21 in S1 before a single draft) show the grammar is guessed, not known, and only learnable from fit_scope echoes of layouts that already exist; and the language's refusals — no labels, no raw offsets, no "keep this group where it is" — killed two sessions outright as honest abandons and shipped an unfixable id-as-label defect. Nested-section-specific failures were the sharpest: weighted splits stretch child sections to band height on first build, and under re-solve pressure a child section escaped its parent VPC entirely while the wrecked-layout gate stayed silent and lint was treated as advisory; R6 fan, the rule this diagram type should showcase, never engaged because it only recognizes hub-over-children, not the hub-beside-children shape every left-to-right architecture diagram uses. A "render early, adjust freely" loop would clearly have beaten the current process: S3 — the only session that looked mid-flight and iterated — produced the only 3.5; S1, S2, and S6 all committed defects that were plainly visible in their own single render.
