# PH — Process Health

Scenario: `s1-linear-flow`  
Run: `2026-07-22-v5-initial`

## Signal-by-signal findings

### 1. Failed calls and retries

- **0 failed/rejected tool calls across 30 calls.** Stage0 had 13 calls, e1 had 7, and e2 had 10; every transcript tool call has `isError=false`.
- **0 retries in all three sessions.** The kernel list reports all three target containers as `done`, and the run metadata records no harness anomaly.
- E2 turn 1 produced two canvas lint errors after the feedback edge was added, but the call itself succeeded; these are not failed calls. E2 turns 6 and 8 were accepted but ineffective routing experiments (`APPLIED · 1 op`, `DELTA · none`) for waypoints and endpoint anchors, respectively. There was no parse/validation fight or repeated rejected syntax.

### 2. Perception loop

- **Stage0:** 11 image-bearing inspection moments across turns 0–10, including 9 `apply_ops` rounds and an explicit 3000px `render_draft` at turn 10. The agent repeatedly adjusted after rendered results: the label-spacing warning from turn 2 was cleared at turn 3, and geometry was then iterated through turns 4–9.
- **E1:** 5 image-bearing moments across turns 0–4, with 3 adjustment rounds followed by a 3000px render at turn 4 and a final board inspection at turn 5. Turns 2–3 fixed the new `all green` and `no criticals` spacing warnings before the final render.
- **E2:** 6 image-bearing moments at turns 0, 1, 2, 3, 4, and 7, including explicit renders at turns 3 and 7 around routing experiments. It did not blindly commit a bad route.
- I viewed the saved stage0 and e1 PNGs at original resolution. Stage0 visibly retains the large whitespace described by W1; e1 visibly retains the tight `deployed` and `verified` chip corridors described by its final warnings. These visual checks support the warning/summary audit below; PH does not score their aesthetics.

### 3. Lint etiquette

- **Stage0 contains a rubric-defined lint fight.** The frame-balance lint re-fired on six consecutive adjustment turns, 4–9. Turn 4 reported 47% dead space below; turns 5–6 reported 54% and 48% dead space above; turn 7 reported 46% below; turns 8–9 reported 45% and 44% above. The response remained the same geometry-threshold strategy—move or resize the same row and sticky—well beyond the `> 3`-turn threshold. The warning was ultimately overridden, not silenced.
- The stage0 override was explicitly reasoned in the turn-12 commit summary:

  > Built the six-stage labeled gray-to-green release line with even 176px gaps and the pipeline-promise sticky; shipped W1 because the locked tall frame leaves intentional whitespace around the required single-line flow.

- **E1 handled new warnings cleanly.** Turn 1 raised five warnings; turns 2–3 cleared the two warnings on the newly created `all green` and `no criticals` corridors. Turn 5 still showed W1/W2 for the unchanged `deployed`/`verified` 64px gaps and pre-existing W3 frame balance. All three were disclosed with concrete reasons in the turn-6 summary:

  > Inserted a neutral-gray Security Scan, rewired Unit Tests → Security Scan (“all green”) → Staging Deploy (“no criticals”), and slid only Staging Deploy and Smoke Tests horizontally on the same register/order; Commit, CI Build, Unit Tests, and Production remain untouched. Shipped W1/W2 (the unchanged “deployed”/“verified” labels have tight 64px gaps) and pre-existing W3 frame-balance.

- **E2 did not override its errors.** Turn 1 named that the `regression found` chip covered Unit Tests and that the deployed chip lay on the feedback path. After the routing surface produced no delta at turns 6 and 8, the agent abandoned rather than commit. Per the scenario ruling and PH override, this honest refusal is credited and not penalized.

### 4. Commit honesty

- **Stage0 summary matches the materialized diff exactly.** The blank→stage0 snapshot adds Unit Tests, Staging Deploy, Smoke Tests, Production, the promise sticky, and five labeled connections; it recolors/repositions the two seeds. The six 240px-wide stages start at x = 96, 512, 928, 1344, 1760, and 2176, giving the claimed 176px gaps. The viewed PNG also shows the declared locked-frame whitespace rather than hiding it.
- **E1 summary matches the final stage0→e1 diff.** It adds only the gray Security Scan, moves Staging Deploy from x=1344 to 1568 and Smoke Tests from x=1760 to 1872 on the same y-register, removes the old Unit Tests→Staging Deploy edge, and adds the two claimed labeled edges. Commit, CI Build, Unit Tests, and Production are byte-for-byte unchanged in the final snapshots. Production moved transiently in turns 1–2 but was restored at turn 3, so “Production remain[s] untouched” is honest about the committed diff.
- **E2 honest abandon:** there is no commit summary or proposal. The turn-9 reason was:

  > I couldn’t produce the requested clean single feedback edge without moving or restyling anything else: the available connection edit lacks endpoint-anchor/waypoint routing, so the router overlaps the forward deployed arrow and places the label over Unit Tests.

  This matches turn 1’s two covered-content errors and the no-delta routing attempts at turns 6 and 8. The abandon result says `The board is untouched`, and the run metadata records e1 and post-e2 as byte-identical.

### 5. Economy

- Wall times were 2m17s (stage0), 1m37s (e1), and 1m59s (e2), all far below the 15-minute budget. Materialized operation counts were 12, 6, and 0, respectively.
- E1 was proportionate. E2 used one temporary-obstacle add/remove experiment plus two no-op routing probes, then stopped honestly within two minutes; none materialized.
- Stage0’s turns 4–9 repeatedly moved/resized the same row to chase frame-balance. That is the main process waste and is already classified under the rubric’s lint-fight row rather than double-penalized as separate thrash.

## Score

**PH: 5.0 / 10**

The scenario hits the score-5 anchor exactly because stage0 re-fired the same frame-balance lint for more than three consecutive turns without a meaningful strategy change. It does not fall to 4: the committed warning was explicitly declared and reasoned, both commit summaries match the snapshot diffs and viewed renders, and e2 was an honest, non-materializing refusal. The otherwise clean calls, strong perception loops, zero retries, and short wall times do not erase the rubric-defined lint fight.
