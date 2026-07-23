# Findings — branching flowchart

Canvas: eval-flowchart · Sessions run: 6 · Date: 2026-07-22

## Sessions

### S1 — "Build the full order-processing flowchart (3 decisions, retry loop, red failure path, Yes/No labels, vertical centerline)"
- session/container: 159c0a9f-e7df-4ec2-b148-483a8d308d8d / b3def9d2-9633-573b-856c-aa07fe2ed23b
- outcome: committed (propose_program retries: 23, all DSL syntax rejections, zero lint/gate events)
- aesthetic: 3 — structurally complete and evenly spaced, but horizontal instead of the requested vertical centerline, no Yes/No labels, no red failure path, terminals truncated to "Order..." (144×46 S pills), and an arrow pile-up at Pack & ship / Retry payment where merge edges land on the same face as forward edges.
- friction:
  - MECH: DSL expressiveness — BLOCKED — 23 consecutive invalid-DSL retries guessing grammar (`direction=column`, weight syntax, `gap=`); `color=green`/`color=red` rejected (turn 5, thinking "Assessing color styling limitations" turn 6); arrow labels impossible after trying `label=`, `text=`, bare string, `: Yes` (turns 20–23, turn 24 thinking "Proposing label-free rendering"). The instruction's Yes/No labels and red failure path were silently dropped.
  - R10 language-refusal — BLOCKED — no way to say "happy path on one vertical centerline with branches off to the sides"; final program (turn 24) is compass slots (at=N/S/E/SE) which the solver rendered as three horizontal bands (image 2026-07-22T16-12-02-823Z_019f8a99-2f87-741e-bf14-38ab05bfe39e.109.1).
  - MECH: size normalization — BLOCKED — size=S pills normalized to 144×46, truncating "Order received"/"Order complete"/"Order failed" (turn 25 render).
  - R2 spacing ladder — PROTECTED — rows and siblings came out at uniform ladder pitches on the very first solve; no crowding anywhere despite 14 objects placed blind.
  - R9 feedback edges — PROTECTED — both loops (correction→validate, retries→payment) detour around content, nothing crosses a box (turn 25 render).
- process: rendered exactly once (turn 25), thinking on the commit turn was "Evaluating layout restructuring options" — saw the truncation and the horizontal-vs-vertical mismatch and committed anyway (turn 26). Single-render habit.

### S2 — "Add a fraud-review branch off Payment authorized?, rejoining at Pack & ship"
- session/container: 45c82edd-43bc-4e7c-bd58-c5a8ce11a16e / 261a407f-fb1c-5e4b-b5b4-1e458661912c
- outcome: abandoned (rejected by operator; propose_program retries: 2)
- aesthetic: 2 — new nodes labeled with id slugs ("manual-fraud-review", "cleared"), decisions re-shrunk to 115×81 and truncated ("Orde…", "Paym…", "Retr…"), and board-spanning edge sweeps (Order valid?→Request correction crosses half the frame; Cleared?→Pack & ship runs ~900px).
- friction:
  - MECH: DSL expressiveness — BLOCKED — the `text=` token is an id for existing objects but the label for new ones; the agent wrote `text=manual-fraud-review` and shipped slug labels (turn 3 program). Edge label `label="Fraud suspected"` rejected again (turn 2).
  - MECH: size normalization — BLOCKED — round-trip refit reclassified the decisions as size=S by area percentile; re-solve shrank committed 160×112 diamonds to 115×81, truncating labels that previously fit (turn 3 delta, image 2026-07-22T16-21-30-244Z_019f8aa1-d804-761d-b248-814f04439c24.25.1).
  - R5 align — PROTECTED — fit_scope emitted `align y` registers for the top and bottom rows (turn 0) and the re-solve kept both rows on clean shared centerlines even as everything moved.
  - MECH: lint thresholds — NEUTRAL — "Lint: clean" on a draft with slug labels, truncation, and 900px edge sweeps; caught nothing.
- process: 2 syntax retries, one render (turn 4), committed the visibly tangled draft immediately (turn 5). Single-render habit; the mess was fully visible in the render it looked at.

### S3 — "Tighten the vertical spacing between the three levels; center the diagram vertically"
- session/container: 8cc39d01-73d0-4de9-bb3d-8ac6756326d1 / 39ad05f0-78ca-5f67-8f81-f68cb12befb5
- outcome: abandoned (rejected by operator; propose_program retries: 2 syntax + 1 revision)
- aesthetic: 2 — the opposite of the ask: row separation grew (~140px render-gaps → ~200px), the diagram spread to full frame width, decisions truncated again, and the retry loop sweeps across the middle of the board.
- friction:
  - R2 spacing ladder — BLOCKED — no vocabulary for "rows N px apart"; inter-row gaps are cluster gutters the solver picks, and the solve fills the 2400×1600 frame. The agent's only dial was hug (turn 4 thinking "Adjusting vertical hug settings to reduce spacing") and it didn't work.
  - MECH: solver collapse / nested-section behavior — BLOCKED — the splitter proportionally fills the frame region, so "tighten" is unexpressible while the frame stays 2400×1600; draft 2 (image 2026-07-22T16-24-00-229Z_019f8aa4-21e5-7669-b6af-12d7483f64ae.29.1) is wider and taller than the board it replaced.
  - MECH: size normalization — BLOCKED — same S-class shrink of the decisions (160×112 → 115×81) as S2.
  - MECH: lint thresholds — NEUTRAL — "Lint: clean" on a proposal that inverted the instruction.
- process: made a second draft after the first solve (weight fiddling, no render between), rendered once (turn 5), committed (turn 6, thinking "Reviewing layout adjustments"). Did not compare against the baseline it was asked to tighten.

### S4 — "Move the Order failed terminal ~20px down and slightly right; don't re-lay-out anything else" (fine-grained probe)
- session/container: a174c677-5a6b-443e-b99d-1d25e9683c48 / 2deefdef-4057-574d-a2ab-85e780744b53
- outcome: abandoned (by the agent itself; propose_program retries: 2 solved + 2 invalid)
- aesthetic: n/a — board untouched (the two solved drafts it refused to commit had moved "Order failed" ~207px south-west with frame overflow, turn 2/turn 5 results).
- friction:
  - R10 language-refusal — BLOCKED — textbook case. The agent inspected exact geometry (turn 1: order-failed at x=1862 y=1104), knew precisely what 20px meant, then tried to invent syntax the language doesn't have: `nudge 2 dx=16 dy=24` (turn 3, invalid) and compass `at=ESE` (turn 4, "unknown compass"). Abandon reason verbatim: "I couldn't express a precise small offset with the available layout constraints without moving other objects or causing overflow, so I left the board untouched." (turn 6)
  - MECH: DSL expressiveness — BLOCKED — compass-slot re-solve of the 2-object scope produced a ~207px move in the wrong direction plus overflow (turns 2, 5) for a 20px ask.
  - MECH: wrecked-layout gate — PROTECTED — credit where due: nothing bad reached the board; the agent's own refusal-to-commit (backed by overflow warnings in the solve results) protected the canvas.
- process: best process of any session — inspect, two solve attempts, two syntax experiments, then an honest abandon instead of committing a 10x-too-large move.

### S5 — "Make the failure path red, Order complete green; don't move anything"
- session/container: 25414e0a-e457-41fd-8a18-79bee3b10d53 / ac8bca05-19ff-5ae1-8cae-74bc5ff596c8
- outcome: abandoned (by the agent, turn 0, before even calling fit_scope)
- aesthetic: n/a — board untouched.
- friction:
  - MECH: DSL expressiveness — BLOCKED — abandon reason verbatim: "I can only rearrange layout; this editor cannot change object colors, so I can't make the requested red/green updates without moving anything." (turn 0). The corpus boards are full of semantic color (red terminals, green inputs) but the layout language has no color channel at all, so "make the failure path visually distinct" — a bread-and-butter flowchart request — is unserviceable end-to-end (also dropped silently in S1).
- process: instant, correct self-diagnosis; zero wasted turns.

### S6 — "The terminal pills truncate — make them big enough for their labels, keep everything else in place"
- session/container: c8f38cb6-74cf-44f6-90e7-e872c11bc585 / 14dbc0f8-c9f7-588f-aee4-472b4837c17c
- outcome: committed (propose_program retries: 0; 2 drafts with a render between)
- aesthetic: 3 — terminals now full-size and readable ("Order received"/"Order complete"/"Order failed" all display; image 2026-07-22T16-28-12-448Z_019f8aa7-fb20-737e-905f-78438ca7d8f1.25.1); but "keep everything else where it is" was ignored — all 13 objects moved ~120–640px in the re-solve, rows drifted further apart, "Payment authori…" still truncates, and the correction-loop edge takes a long detour across the top.
- friction:
  - R8 size semantics — PROTECTED — the fix worked *through* the size-class system: bumping the pills a class (turn 1, "Adjusting pill sizes and layout anchors") produced 270×86 terminals that fit their text; the class system made the repair a one-token edit.
  - MECH: DSL expressiveness — BLOCKED — "keep everything else where it is" is unsayable: propose_program rewrites the whole program and re-solves the whole scope, so a local size fix moved every object on the board (delta: 13 moved).
  - MECH: single-render habit — PROTECTED (inverted evidence) — the one session where the agent rendered (turn 2), revised the program (turn 3), rendered again (turn 4), then committed — and it produced the only accepted edit of the day.
- process: render → adjust → render → commit. The only fine-tune loop observed, and it correlates with the only Phase-B accept.

## Rule tally

| rule | PROTECTED | BLOCKED | NEUTRAL | strongest evidence |
|------|-----------|---------|---------|--------------------|
| R1 16px grid | 0 | 0 | 6 | never surfaced either way; solved coords are lattice-derived |
| R2 spacing ladder | 1 | 1 | 4 | PROTECTED: S1 first solve evenly pitched, zero crowding. BLOCKED: S3 — no gap dial, "tighten" came back looser (t4 hug workaround) |
| R3 section trim | 0 | 0 | 6 | page-frame header band respected everywhere; nothing else fired |
| R4 grid | 0 | 0 | 6 | no 4+ lattice ever formed |
| R5 align | 2 | 0 | 4 | S2 t0: fit_scope emitted `align y` row registers that survived every re-solve |
| R6 fan | 0 | 0 | 6 | decision branches split across sides; never detected |
| R7 hug | 0 | 0 | 6 | fired on node-start (S2 t0 hug=NW); changed nothing that mattered |
| R8 size semantics | 1 | 1 | 4 | PROTECTED: S6 one-token size-class bump fixed terminals. BLOCKED: percentile reclassification shrank committed 160×112 decisions to 115×81 (S2/S3 deltas) |
| R9 feedback edges | 2 | 0 | 4 | S1/S6 renders: both loops detour cleanly, no box crossings — though merge edges pile onto shared faces (S1 Pack & ship) |
| R10 language-refusal | 0 | 3 | 3 | S4 t3: invented `nudge 2 dx=16 dy=24`; abandon: "couldn't express a precise small offset" |
| MECH: size normalization | 0 | 3 | 3 | S1 144×46 pills truncating three terminal labels; S2/S3 diamond shrink |
| MECH: wrecked-layout gate | 1 | 0 | 5 | S4: overflow warnings + agent judgment kept a 207px wrong-way move off the board |
| MECH: lint thresholds | 0 | 0 | 6 | "Lint: clean" on every proposal, including S2's slug-label tangle and S3's inverted result |
| MECH: DSL expressiveness | 0 | 6 | 0 | S1: 23 syntax retries + no labels/colors; S5 t0: "this editor cannot change object colors"; S6: "keep everything in place" unsayable |
| MECH: single-render habit | 1 | 0 | 3 | S2/S3 committed visibly bad drafts after one look; S6's render→revise→render loop produced the only accepted edit |
| MECH: solver collapse / nested-section | 0 | 1 | 5 | S3: frame-filling solve makes "tighten"/"compact" unexpressible |

(Counts are per-session observations across the 6 sessions; NEUTRAL = fired-or-idle with no material effect that session.)

## Verdict for this diagram type

For branching flowcharts the geometric rules broadly earn their keep: R2/R5/R9 gave every solve even pitches, clean cross-group row registers, and loop edges that never cross a box — the first blind solve of a 14-node/3-decision flow was structurally publishable, which is genuinely hard. What blocked intent was almost never a corpus rule and almost always the language around them: no arrow labels (fatal for a flowchart — Yes/No is the diagram's semantics), no color channel (failure-path distinctness refused twice, once silently, once by instant abandon), no offset finer than a compass slot (the 20px nudge died with the agent inventing `nudge dx dy` syntax), and whole-program re-solve semantics that turn "enlarge three pills, touch nothing else" into 13 objects moving. Size normalization was the one mechanism that actively damaged committed work: percentile reclassification shrank previously-fine decision diamonds below their text on every round trip. A "render early, adjust freely" loop would clearly have beaten the current process — the two ugliest proposals (S2, S3) were committed after a single look at a render that plainly showed the problem, while the one session that rendered twice and revised in between (S6) produced the only accepted edit; and 23 of S1's 26 turns were spent guessing grammar rather than looking at anything. Flowchart-specific: edge labels and per-edge semantics matter more here than for any other diagram type, and decision diamonds are unusually sensitive to size reclassification because their labels barely fit at M. The nudge refusal, color refusal, and whole-board re-solve churn look universal.
