# Findings — state machine

Canvas: eval-state-machine · Sessions run: 8 · Date: 2026-07-22

## Sessions

### S1a — "Build full connection-lifecycle state machine (labeled transitions, cycle, self-loop)"
- session/container: 922c3110-a89d-4a7c-b200-5413fe4db972 / 7ede2b81-c99b-55c1-a69d-7e3b58289dcc
- outcome: harness-death (cross-session collision: status flipped to `abandoned` after ~180s with proposalCount 0 and no error; the transcript endpoint for this containerId returned another eval agent's run — eval-nested-arch's "Production VPC" instruction — so the kernel container was serving a concurrent session)
- aesthetic: n/a — no proposal produced
- friction:
  - MECH: wrecked-layout gate — NEUTRAL — nothing rule-related fired; pure harness concurrency failure
- process: n/a. Evidence: transcript userMessages for container 7ede2b81 contain the nested-arch instruction, not mine.

### S1b — "Build full connection-lifecycle state machine (retry of S1a)"
- session/container: 3127d283-2437-4a53-b2b2-2100f8ff7b9e / 76577040-abe1-5a83-a029-fd4e76265040
- outcome: committed (propose_program retries: 14 failed calls out of 17 — 13 invalid-DSL, 1 raw JS crash)
- aesthetic: 2 — the R4 lattices (1×5 state row, 1×4 label row) are clean, but all nine transition labels are disconnected floating rectangles, the Connecting→Idle back-edge exactly overlaps the Idle→Connecting forward edge (reads as one bidirectional arrow), the Connected self-loop renders as a degenerate line straight through the Connected box, and the bottom third of the layout overflows the page-frame by up to 460px.
- friction:
  - MECH: DSL expressiveness — BLOCKED — the agent tried four different arrow-label syntaxes (`label="connect()"` turn 7, bare `"connect()"` turn 8, `text="connect()"` turn 9, `: "connect()"` turn 10); all rejected "unexpected text". Connector labels are simply unsayable, though the canvas schema has `connection.label`. Fallback: nine free-floating label rectangles (turns 13, 17). `type=text` for lighter labels crashed with a raw `undefined is not an object (evaluating 'OBJECT_TYPE_DEFAULTS[item.type].geometry')` (turn 16).
  - R9 feedback edges — BLOCKED — `route=above`/`route=below` hints rejected (turn 7); the router then laid the Connecting→Idle back-edge exactly on top of the forward edge (draft SVG paths `M 574 1208 L 650 1208` vs `M 650 1208 L 574 1208`), and rendered the accepted `2 > 2` self-loop as a degenerate path through the box interior (`M 1486 1208 … L 1106 1208`). Self-loops are DSL-accepted but visually inexpressible. (turn 18, image 2026-07-22T16-17-14-122Z_….81.1)
  - R2 spacing ladder — NEUTRAL — `gap=128` rejected for a grid (turn 14); agent settled on 96 with no visible harm.
  - R4 grid — PROTECTED — the two lattices are the only genuinely tidy part of the result; pitch and registers are exact.
  - MECH: wrecked-layout gate — NEUTRAL — never fired despite the commit overflowing the locked page-frame by hundreds of px (only lint "Overflow" lines, which the agent ignored).
- process: exactly one render (turn 18); turn-19 thinking says "Planning label box size reduction" — it saw the labels were oversized and committed anyway. Textbook single-render habit.

### S2a — "Attach labels to their transitions; separate the overlapping back-edge"
- session/container: 78bffdb1-60e5-4bc3-8385-5b67b5711934 / a3cdd159-21ff-5e81-a50b-683657a50c30
- outcome: abandoned (agent's own abandon, turn 2, ~20s)
- aesthetic: n/a — board untouched
- friction:
  - MECH: DSL expressiveness (fit_scope program shape) — BLOCKED — scoping by `page-frame` silently excluded the five label boxes that S1b had committed outside the frame; the agent abandoned: "only four of the nine transition-label boxes are editable here; timeout, heartbeat / 30s, session resumed, close(), and socket closed are outside the scope and cannot be moved." The refusal is honest, but the root cause is S1b's un-gated overflow commit plus geometric scope derivation.
- process: fit_scope → inspect → abandon; correct behavior given the scope, no render needed.

### S2b — "Attach labels / separate back-edge (retry with explicit 16-object scope)"
- session/container: 520a7c45-ea01-4d21-8ee2-304b643f7272 / 1a2f6184-24af-5d02-a697-a67deee88030
- outcome: harness-death (status `error`: "stream_incomplete: Upstream websocket closed before response.completed", after 4 invalid-DSL retries at turn 5)
- aesthetic: n/a
- friction:
  - MECH: DSL expressiveness — NEUTRAL — 4 more grammar-guessing retries (`hug=M`, missing `at=`, weight-count errors) before the upstream died; same class as elsewhere, nothing new blocked.
- process: n/a — died mid-syntax-fight.

### S2c — "Attach labels / separate back-edge (second retry)"
- session/container: 4894d7cd-b606-4e4f-baa7-ce88a958dd48 / 92135108-007b-5ea5-8d4b-db2780028a58
- outcome: committed (propose_program retries: 6 failed calls before Draft 1)
- aesthetic: 2.5 — everything is back inside the page-frame and five labels now sit on their transitions, but only via a hack: the agent deleted 5 semantic connections and re-routed them as two-hop paths through the label boxes (Draft 3: "5 connections DELETED"). The mid/bottom of the board is a tangle of long vertical drops, the four main-flow labels still float disconnected at the top, and the Connected↔Degraded pair still reads bidirectional.
- friction:
  - R2 spacing ladder — BLOCKED — `gap=16` rejected (turn 3, "not on the spacing ladder (0/32/64/96)") precisely where the instruction wanted labels tight against their edges; nearest legal rung 32 is twice the wanted gap.
  - R8 size semantics — BLOCKED — `size=XS` rejected (turn 5, "unknown size class"); labels cannot be made meaningfully smaller than S, so "shrink them so they read as labels" was only half-satisfiable.
  - R9 feedback edges / MECH: DSL expressiveness — BLOCKED — `route=below` rejected (turn 6); with no routing vocabulary the agent invented node-through routing (turn 10 thinking: "Planning arrow routing via intermediate nodes"), changing graph topology to fake edge labels.
  - MECH: lint thresholds — NEUTRAL — off-ladder spacing warnings persisted into the commit with no consequence.
- process: good loop for once — three renders (turns 9, 11, 13; images ….45.1, ….53.1, ….61.1) with a real adjustment after each; committed on the third look.

### S3 — "Add Suspended, reachable from Connected and Degraded, returning to Reconnecting"
- session/container: 74c5f4b9-4a76-4986-9568-4833b5561a1a / 1d264591-e8e3-5953-9f0d-176f736b943b
- outcome: committed (propose_program retries: 5 failed calls)
- aesthetic: 2.5 — Suspended itself is well placed (short edges from Connected and Degraded, return to Reconnecting routed around, no main-flow crossings — the one thing the instruction most wanted), but the three new label chips physically overlap existing boxes ("admin suspend" sits on "packet loss > 5%", "quarantine" on "grace expired") and sit far from the transitions they name.
- friction:
  - MECH: size normalization — BLOCKED — every draft force-resized all nine existing label chips 259×173 → 360×240 (M, identical to the state boxes), erasing the label/state size distinction the previous session had fought for; the agent's `size=S`/small intent was normalized away (turn 7/8/10 move lists, image 2026-07-22T16-31-26-930Z_….53.1).
  - MECH: lint thresholds — NEUTRAL (a miss) — lint reported a 19px off-ladder gap and a 1px frame overflow but was silent about chip-on-box overlaps, the dominant visual defect in the commit (turn 10 result tail).
  - R2 spacing ladder — NEUTRAL — more off-ladder warnings (10px, 83px, 85px) acknowledged and shipped.
  - R9 feedback edges — PROTECTED — the Suspended return edge and the Reconnecting→Connected cycle detour route through corridors around content, not through boxes; the cyclic structure the instruction asked for is legible.
- process: two renders (turns 9, 11), one adjustment between them; turn-9 thinking literally "Considering rendering despite lint" — looked, tweaked once, committed with known lint.

### S4 — "Nudge 'admin suspend' ~20px down / 30px left and 'quarantine' ~20px down to clear overlaps; move nothing else" (deliberate fine-grained probe)
- session/container: b293b986-3c38-4dc5-a327-5afa33d1c5aa / 43f04a77-ef73-534f-a827-070d6f48a49b
- outcome: abandoned (agent's own abandon after 3 failed attempts)
- aesthetic: n/a — board untouched; the overlap the system itself created stayed on the board
- friction:
  - R10 language-refusal — BLOCKED — the agent invented `nudge=(-32,24)` (turn 2, rejected "unexpected text"), then tried anchor/hug restructuring (turns 3–4, rejected), then abandoned with the perfect self-diagnosis: "The layout program cannot express local pixel nudges for these overlay chips; changing their structural anchors would also re-solve other objects, violating the requirement to move only those two chips." (turn 5)
  - R1 16px grid — NEUTRAL — never reached; the syntax refusal fires before any grid rounding could.
  - MECH: DSL expressiveness — BLOCKED — same event from the mechanism side: no positional offset op exists, and any structural change re-solves unrelated objects, so surgical edits are categorically impossible.
- process: fit_scope → inspect → 3 attempts → abandon. Honest refusal; the cost is that a 20px fix a human does in one drag is unreachable.

### S5 — "Make failure transitions dashed red; happy path solid gray; styling only"
- session/container: b928a4bd-d209-4e23-871b-4eff4dfe30c6 / 79a2bf41-ef25-55ac-96f2-887e8e491f61
- outcome: abandoned (agent's own abandon after 4 failed attempts)
- aesthetic: n/a — board untouched
- friction:
  - MECH: DSL expressiveness — BLOCKED — tried `color=gray style=solid` (turn 1), `solid gray` (turn 2), `[dashed,red]` (turn 3), Mermaid-style arrow operators (turn 4); all rejected. Abandon reason: "The scoped layout language exposes connector routing but not connector color or dash styling." The canvas schema supports both (`style: "dashed"`, 10-color roster) — the DSL just cannot say them, so a purely stylistic, zero-geometry request is unfulfillable.
- process: fit_scope → 4 attempts → abandon; no render (nothing to render).

## Rule tally

| rule | PROTECTED | BLOCKED | NEUTRAL | strongest evidence |
|------|-----------|---------|---------|--------------------|
| R1 16px grid | 0 | 0 | 1 | S4 — never reached; syntax refusal fires before grid rounding |
| R2 spacing ladder | 0 | 1 | 3 | S2c t3: gap=16 rejected exactly where labels needed to hug their edges |
| R3 section trim | 0 | 0 | 1 | page-frame label chip rendered fine throughout; no friction |
| R4 grid | 1 | 0 | 0 | S1b: the 1×5 state / 1×4 label lattices are the cleanest geometry on the board |
| R5 align | 0 | 0 | 1 | registers implicit in fit_scope output; never a distinct event |
| R6 fan | 0 | 0 | 1 | no fan detected in any session |
| R7 hug | 0 | 0 | 1 | S4 t4: `hug=` misuse error; otherwise inert `hug=NW` noise in fitted programs |
| R8 size semantics | 0 | 2 | 0 | S2c t5: `size=XS` unknown; S3: chips normalized up to state size |
| R9 feedback edges | 1 | 2 | 0 | S1b: back-edge exactly overlaps forward edge; self-loop drawn through the box (SVG paths). PROTECTED: S3 cycle/Suspended detours route cleanly around content |
| R10 language-refusal | 0 | 2 | 0 | S4 abandon: "cannot express local pixel nudges … would also re-solve other objects" |
| MECH: size normalization | 0 | 1 | 0 | S3: all label chips force-resized 259×173 → 360×240, erasing label/state distinction |
| MECH: wrecked-layout gate | 0 | 0 | 2 | S1b committed with ~460px overflow past a locked frame; gate silent |
| MECH: lint thresholds | 0 | 0 | 2 | S3: flags a 1px overflow yet misses chip-on-box overlaps |
| MECH: DSL expressiveness | 0 | 4 | 1 | S1b arrow labels (4 syntaxes rejected, `type=text` crashes); S5 no connector color/dash; S4 no offsets; S2a scope drops out-of-frame objects |
| MECH: single-render habit | 0 | 1 | 1 | S1b: saw oversized labels in its one render, committed anyway (S2c/S3 iterated — better) |
| MECH: solver collapse / nested-section | 0 | 0 | 1 | not observed on this flat board |

## Verdict for this diagram type

For state machines the layout language is missing its two load-bearing primitives — edge labels and edge styling — and everything downstream of that is compensation: labels became floating M-sized rectangles, then became fake intermediate nodes spliced into the transitions, then overlapped real boxes, and the one session asked to fix that overlap surgically had to abandon because the language has no offset op (R10 working exactly as documented, and exactly against the user). R9's corridor detours genuinely earned their keep on the multi-hop cycle (Reconnecting→Connected and the Suspended return route cleanly), but R9's router also produced the two worst semantic lies on the board: a back-edge drawn exactly on top of its forward edge (reads as bidirectional) and a self-loop drawn straight through its own box — cyclic and reflexive edges, the defining features of this diagram type, are the ones it handles worst. R2/R8 mostly subtracted here: the ladder's 32px floor and the S-size floor both blocked the "small label hugging its edge" idiom, while MECH size normalization actively un-did it. Process-wise the agent fine-tuned when it looked (S2c: three renders, three improvements) and shipped known flaws when it looked once (S1b), so a "render early, adjust freely" loop with a working nudge/label/style vocabulary would have beaten the current process decisively — most of the 30+ failed propose_program calls across these sessions were the agent guessing at grammar for things the language turned out to refuse. Diagram-type-specific: self-loops, back-edge/forward-edge separation, and per-edge labels/styles; universal: the grammar-guessing tax, the silent wrecked-gate on frame overflow, and lint that measures 1px overflows while missing box-on-box overlaps. Separately, harness reliability cost three sessions (one cross-container collision, one upstream websocket death, and the studio proxy at :3999 died mid-eval — direct :4820 stayed up).
