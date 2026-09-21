# Findings — swimlane pipeline

Canvas: eval-swimlane · Sessions run: 6 · Date: 2026-07-22

## Sessions

### S1 — "Build 4-lane request-processing swimlane pipeline (15 stages, 7 cross-lane handoffs)"
- session/container: 7de5688c-79e6-49b8-bc77-78d441cd1640 / 5e09f5a5-33ca-5426-8f04-5aded0a74f3b
- outcome: committed (propose_program retries: 13 — 12 consecutive syntax rejections, then 1 lint-driven revision; 2 drafts solved)
- aesthetic: 3 — lane rail and cross-lane stage columns are immaculate (handoffs drop dead-vertical), but the two skip-lane connectors (Enqueue Job→Job Queue, Results DB→Serve Result) route as giant perimeter detours around the entire full-width Workers lane, and the staggered layout leaves large dead space in the lower-left of Workers/Data.
- friction:
  - MECH: DSL expressiveness — NEUTRAL — 12 straight `Invalid sketch DSL` rejections while the model rediscovered the grammar by trial and error (`column`→`col`, mandatory integer object numbers, mandatory `at=`, weights as `1|1|1|1` after rejecting space/comma/colon/slash/`weights=` forms, arrows `>` not `->`) (turns 1–12). Pure time tax; the final program was unharmed.
  - MECH: lint thresholds — PROTECTED — Draft 1 overflowed the frame (page-frame +64px, data +16px, turn 13); the agent responded with size=S and a 5-column staggered layout (turn 14) that is genuinely better — tighter, fits, and creates the cross-lane column registers.
  - R9 feedback edges — BLOCKED — sections are un-crossable boxes for the router, so any handoff that skips a lane (API→Data across Workers) must detour around the whole 2640px-wide lane perimeter (turn 15, image 2026-07-22T16-11-40-932Z_019f8a98-da04-77da-b847-b79e92549d20.69.1). In a swimlane diagram skip-lane handoffs are a core idiom and should thread between lanes.
  - R2 spacing ladder — PROTECTED — uniform lane gaps and stage pitch came out clean with zero effort spent on them.
- process: rendered exactly once (turn 15), and the turn-16 thinking explicitly acknowledged "perimeter routing for giant paths" — then committed anyway. Commit-on-first-acceptable; no attempt to restructure so the detours disappear.

### S2 — "Add a fifth Observability lane below Data (strict: everything must still fit in the page frame)"
- session/container: 41c38b41-cee8-4898-9ce6-b43b919a59e8 / 41552022-bdbf-58a2-9ee7-baeadaef275c
- outcome: abandoned (propose_program retries: 6; 3 drafts SOLVED but never rendered, then abandon)
- aesthetic: n/a — nothing committed; the board was untouched.
- friction:
  - R3 section trim — BLOCKED — five lanes × (64px header + 48px padding + minimum content row) cannot compress below ~1808px total; drafts forced page-frame from 1536 to 1984/1904/1808 (turns 2–4 deltas) and the agent had no knob to slim lane trim, so the "fit inside the frame" constraint was unsatisfiable.
  - R8 size semantics — BLOCKED — agent reached for `size=XS` ("unknown size class", turn 5) and `section … size=S` ("unexpected text", turn 6); the closed 3-size system offered no smaller step, so density could not be traded for fit.
  - MECH: single-render habit — NEUTRAL (but damning) — three solved drafts existed and the agent abandoned without rendering even one; the operator never got to see that Draft 3 (1808px, ~208px overflow) was arguably acceptable.
- process: never looked at a render at all — abandoned sight-unseen with the reason "minimum lane height makes the fifth lane overflow by 224px".

### S3 — "Same Observability lane, but board growth explicitly allowed"
- session/container: 3dc4c29e-131b-494f-9660-311bc86b1305 / 0f4827e0-aa0c-50b8-ac9a-d0d5dcf4cddf
- outcome: committed (propose_program retries: 3 — 1 syntax; 2 drafts solved)
- aesthetic: 2 — the lane itself lands perfectly (aligned rail, consistent height, columns preserved), but the two new skip-lane connectors (Process Data→Collect Metrics, Serve Result→Trace Requests) wrap around lanes and produce overlapping horizontal runs at the Observability boundary, with the arrow into Collect Metrics crossing directly over Trace Requests (turn 6, image 2026-07-22T16-22-35-204Z_019f8aa2-d5c4-73ec-bfe3-0db028cae8f3.33.1).
- friction:
  - R9 feedback edges — BLOCKED — same lane-impenetrability as S1, now with three wrapped paths converging on one lane; the routing visibly degrades as skip-lane edge count grows.
  - MECH: lint thresholds — NEUTRAL — committed over 5 overflow warnings (all stale-frame noise once growth was authorized — the lint cannot distinguish sanctioned growth from error) plus one lint of the solver against itself: "parse-request ↔ enqueue-job gap 117px is off the ladder (nearest rung 128px)" — the weighted-band solver emitted an off-ladder gap its own lint then flagged.
- process: best of the run — rendered Draft 1, used inspect, noticed the new stages had lost their display labels, fixed in Draft 2, re-rendered, committed. Fine-tuned after looking, but only for label content — the connector tangle visible in the final render was not acted on.

### S4 — "Make the four async queue handoffs dashed (styling-only change)"
- session/container: 054d5c67-475d-4033-a818-9e999b4ca6c9 / 91a8fd08-f6a4-530f-a4ce-e96136fbcffe
- outcome: abandoned (propose_program retries: 7, all syntax probes for a connector-style attribute)
- aesthetic: n/a — nothing committed.
- friction:
  - MECH: DSL expressiveness — BLOCKED — the arrows sub-language has no style vocabulary at all. The agent probed `dashed`, `style=dashed`, `[style=dashed]`, `dash`, and positional forms (turns 1–7), then abandoned: "The layout DSL exposed for this scope does not accept connector-style attributes" (turn 8). The canvas schema itself supports `style: "dashed"` on connections (bubba-voice uses solid/dashed + colors), so this is purely a language gap, and sync-vs-async edge styling is a bread-and-butter swimlane request.
  - R10 language-refusal — BLOCKED — same event, counted once here for the rule-name tally: the language refuses to say anything about an edge except its endpoints.
- process: no render (nothing to render — no draft ever solved); the abandon reason was accurate and honest.

### S5 — "Workers lane 20px taller; nudge Pick Up Job ~20px right off the connector" (deliberate fine-grained probe)
- session/container: d6f1eea1-0626-4b79-a24d-7832150ec013 / 2e3cb591-41a5-5d0d-b00a-4d13a23dcd30
- outcome: abandoned (propose_program retries: 4; 1 draft solved via fractional-weight hack, then abandon)
- aesthetic: n/a — nothing committed.
- friction:
  - R10 language-refusal — BLOCKED — no raw coordinates: the agent probed `h=308`, `size=2640x308`, `padding=58` (turns 2–4, all rejected), and its closing thinking was titled "Determining inability for exact pixel adjustments"; abandon reason: "the scoped layout solver only supports ladder-based structural changes here; it can't make the requested isolated ~20px height and horizontal nudges without reflowing many other objects" (turn 6).
  - R1 16px grid / R2 spacing ladder — BLOCKED — 20px sits between rungs by design; the only lever that solved (col weight `5.35`, turn 5) moved 18 objects including a 297px shift of Show Progress — a full-board reflow purchased for a 20px nudge.
  - MECH: solver collapse / nested-section behavior — NEUTRAL — the fractional-weight draft did solve without wrecking, and the agent's refusal to commit that 18-object collateral was the right call for the board.
- process: no render; abandoned after reading the Draft 1 delta text (the delta report, not an image, is what killed the fractional-weight route — reasonable).

### S6 — "Enlarge the two terminal stages; column-align Observability stages under Data stages"
- session/container: 63f1433d-1e7f-478a-b83f-6c3810254d9e / 0d5519ac-6516-59b1-9f68-c180a77ff108
- outcome: committed (propose_program retries: 2; 2 drafts solved)
- aesthetic: 3 — both asks landed exactly (Render Result and Alerting visibly L-sized; Collect Metrics/Trace Requests dead-under Job Queue/Object Store with straight vertical drops), but the inherited perimeter detours remain and a few horizontal segments still overlap near Trace Requests/Alerting (turn 4, image 2026-07-22T16-30-08-455Z_019f8aa9-c047-74cb-b951-051467a7089e.26.1).
- friction:
  - R8 size semantics — PROTECTED — `size=L` expressed terminal emphasis in one token and the solver kept everything else registered; exactly what the rule is for.
  - R5 align — PROTECTED — the cross-lane column registers held through the edit; the requested under-alignment was expressible and solved cleanly.
  - MECH: DSL expressiveness — NEUTRAL (near-miss) — Draft 1 silently omitted four Frontend stages, and in this language omission means deletion; the agent caught it with inspect ("3: not present in the current draft…", turn 2) and restored them in Draft 2. A less careful pass would have committed a proposal that deletes half the Frontend lane as a side effect of a styling edit.
  - MECH: lint thresholds — NEUTRAL — committed over the same stale-frame overflow noise as S3.
- process: the healthiest loop of the run — draft, inspect + render, fix, re-render, commit. Two looks, one real fix between them.

## Rule tally

| rule | PROTECTED | BLOCKED | NEUTRAL | strongest evidence |
|------|-----------|---------|---------|--------------------|
| R1 16px grid | 0 | 1 | 0 | S5: 20px nudge unrepresentable; `h=308` rejected (turn 2) |
| R2 spacing ladder | 1 | 1 | 1 | S5 blocked 20px; S1 protected lane rhythm; S3 lint flags solver's own 117px gap |
| R3 section trim | 0 | 1 | 0 | S2: 5 × (64+48) lane minimums forced 1808–1984px height, drove abandonment (turns 2–4) |
| R4 grid | 0 | 0 | 1 | never detected; lane columns built manually via weighted rows + phantom groups (S1 turn 14) |
| R5 align | 2 | 0 | 1 | S6: requested under-alignment expressed and solved cleanly; align op itself never emitted |
| R6 fan | 0 | 0 | 0 | no fan-shaped structure in this diagram type |
| R7 hug | 0 | 0 | 0 | never fired |
| R8 size semantics | 1 | 2 | 0 | S2: "unknown size class XS" + unsizable sections killed the fit; S6: size=L emphasis worked perfectly |
| R9 feedback edges | 0 | 2 | 1 | S1/S3: skip-lane handoffs forced into perimeter mega-detours around full-width lanes (images …69.1, …33.1) |
| R10 language-refusal | 0 | 2 | 0 | S4 abandon: "does not accept connector-style attributes"; S5 abandon: "can't make isolated ~20px nudges" |
| MECH: size normalization | 0 | 0 | 1 | S1: solver shrank M processes to 132×69 then S; harmless here |
| MECH: wrecked-layout gate | 0 | 0 | 0 | never fired in 6 sessions |
| MECH: lint thresholds | 1 | 0 | 2 | S1: overflow lint bought the better staggered Draft 2; S3/S6: stale-frame overflow noise committed over |
| MECH: DSL expressiveness | 0 | 1 | 3 | S4: no connector style vocabulary at all (7 probes, abandon); S1: 12-turn syntax-discovery tax; S6: omission=deletion near-miss caught by inspect |
| MECH: single-render habit | 0 | 0 | 3 | S2: abandoned with 3 solved drafts and zero renders; S1: saw "giant paths" in its one render and committed anyway |
| MECH: solver collapse / nested-section behavior | 0 | 0 | 1 | S5: fractional-weight draft solved but reflowed 18 objects for a 20px ask |

## Verdict for this diagram type

For swimlanes the geometry rules earn their keep completely: R2/R5/R8 gave every committed board its best qualities — equal-height lanes, a clean left rail, and dead-vertical cross-lane handoffs — essentially for free, and the one lint-driven retry (S1) genuinely improved the layout. The type-specific failure is R9 routing: swimlane handoffs that skip a lane are a core idiom, but full-width lane sections are impenetrable boxes to the router, so every skip-lane connector becomes a perimeter mega-detour around 2640px of lane — the dominant aesthetic defect in all three committed renders, and it compounds as edges accumulate (S3). The language blocked three legitimate asks outright: connector styling (S4 — the canvas schema supports dashed, the DSL just can't say it), sub-ladder density (S2 — R3 trim minimums plus a closed size system made five lanes unfittable), and the 20px nudge (S5 — refused exactly as R10 documents, and the only workaround that solved reflowed 18 objects). A "render early, adjust freely" loop would clearly have beaten the current process: S1 committed immediately after one look at detours its own thinking called "giant paths", and S2 abandoned three solved drafts without rendering any of them, while the only session that looked twice (S6) was also the only one that caught and fixed a real defect — including a silent omission-means-deletion near-miss that inspect, not rendering, surfaced. The R9 lane-crossing problem and the R3 lane-height floor are swimlane-specific; the syntax-discovery tax (12 wasted turns in S1, re-paid in later sessions), the connector-style gap, and the single-render habit look universal.
