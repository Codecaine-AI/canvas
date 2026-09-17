# v4 round 1 — state machine

Canvas: eval-v4-state-machine · Sessions: 3 (S1 build, S2 readability probe, S3 Suspended edit) · Date: 2026-07-22
Baselines: `findings-state-machine.md` (old system, 8 sessions) and `v3-trial-state-machine.md` (v3, 3 sessions).
Reference anchoring done first: gc-decomp-harness (≈7.5) and intent-classification-2 (≈7) rendered at 2800px and viewed side-by-side with every output judged below. Scratchpad: `…/scratchpad/v4r1-sm/` (ref-gc.svg.png, ref-intent.svg.png, s1-draft.png, s1-committed.png, s2-draft.png, s3-draft.png, crop-*.png).

All three sessions: zero failed tool calls, zero harness deaths, 3–11 min wall each, all committed by the agent, all accepted and materialized by me (final board: 13 objects / 15 connections, verified via :4000 GET after each PUT).

## Sessions

### S1 — build: full connection lifecycle, labels ON connectors, dashed-red failures, teal shutdown, heartbeat self-loop, margin sticky, reference finish
- session/container: 5f883fcc-5376-4916-88c0-6d037c91b720 / 0d1e3358-7876-5fad-b55c-26eae30b5f03
- outcome: proposal-ready in ~3.5 min → accepted. 23 ops (10 addObject, 12 addConnection, 1 updateObject).
- tool sequence: board → apply_ops → render ×6 interleaved with 6 apply_ops rounds → commit. 16 turns. The board tool's first call included the house-style exemplar image and the note "Aim for this level of finish" — the finished output visibly imitates it (chips, sticky, color-coded flows).
- diagnostics story:
  - t3 (after adding all 9 edges directly): **E1 label-clearance** — "connect()" chip overlaps "timeout" chip — AND **W1 edge-clarity: edge-connect and edge-timeout run anti-parallel between seed-idle and state-connecting**. This is exactly the v3 killer pair (v3/old drew the timeout back-edge on top of the forward edge). The agent HEEDED both: t5 removed the direct timeout edge and rebuilt it as an elevated corridor via two `or-junction` waypoint objects (t5 thinking headers verbatim: "Evaluating anti-parallel edge workarounds → Proposing junction nodes for labeling"). E1 cleared at t7.
  - W1 hub-balance (state-connected 568px left of neighbors' midpoint) persisted t7→commit; OVERRIDDEN with verbatim commit note: "W1 hub-balance is intentionally overridden to preserve the left-to-right spine". Correct call — quickfixing it would have broken the requested left-to-right flow.
  - Self-loop: the agent never attempted a self-edge (v3's two-layer failure). Commit note verbatim: "heartbeat is a labeled Connected badge because self-loop connectors are unsupported" — a green pill "↻ heartbeat / 30s" placed near Connected. The badge compensation works at the semantic level but the pill is visually UNANCHORED (no containment, no connector) — see S2 for how this decays.
- renders: 6 (2400→3200px, escalating for legibility checks).
- aesthetic (anchored): **6 / 10** vs gc-decomp-harness 7.5. Side-by-side delta: the reference reads as continuous tinted flows with zero routing machinery visible; S1 leaks three bare crosshair junction glyphs (route-timeout, route-timeout-idle, route-recovered), floats the heartbeat badge in open space, has no section tints, and leaves the bottom ~40% of the locked frame dead. What it matches: every one of the 9 label chips owns clear air (the v4 smoke board's cramped spine did not reproduce), failure/shutdown color coding reads instantly, margin sticky present.
- v3/old delta: old S1b committed at 2/5 with 14 failed DSL calls, floating label rectangles, an overlapping back-edge and a self-loop drawn through the box. v4 S1 is the first build session in three generations with zero failed calls and zero label-chip collisions at commit.

### S2 — readability iteration probe: "give every labeled edge room to breathe, widen the corridors, rebalance … polish to reference quality"
- session/container: 80971fc6-a8dd-4220-85ca-0bbd7bca0a10 / 84dac965-e5d3-5c43-91c7-e22b433875a0
- outcome: proposal-ready in ~11 min → accepted. 10 ops, ALL updateObject geometry — a pure spread pass, no structural collateral (v3's S4 rewrote the whole board for less).
- did it actually spread? **Yes, measurably**: connect() corridor ≈256px → ≈440px; grace-expired corridor ≈176px → ≈390px; Degraded/Reconnecting lifted onto a distinct upper lane; final DIAGNOSTICS clean including the S1 hub-balance warning (Connected ended centered under its fan as a side effect).
- diagnostics story — the probe worked as designed:
  - **E1 label-clearance fired 4×** during iteration (t2 "packet loss > 5%" chip covers heartbeat-badge; t4/t6/t10 "grace expired" chip vs "recovered" chip) — each HEEDED with geometry moves; clean at t11. The error tier means the commit gate would have blocked any of these — none survived.
  - **W1 spacing (new labeled-edge breathing check) fired 1×** (t8: gap route-timeout↔route-recovered 48px off ladder) — resolved by subsequent moves.
  - 7 renders including 2 targeted crop zooms (t7 crop hunting the chip overlap, t12 final verification crop).
- aesthetic (anchored): **6.5 / 10** vs reference 7.5. Delta sentence: corridors are now genuinely reference-grade wide and every chip breathes, but "rebalance" was interpreted horizontally only — the bottom ~40% of the frame stays empty (the reference fills its frame with deliberate density variation), the three crosshair junctions remain, and the heartbeat pill drifted to sit beside the recovered-junction wire where it now reads as that wire's label (crop-s2-heartbeat-junction.png).
- visible misses lint called clean (evidence in crop-s2-heartbeat-junction.png): (1) the "recovered" edge terminates arrowhead-into-a-crosshair-glyph — reads as a dead end; (2) the packet-loss dashed wire's lower end merges into the session-resumed corridor bend — its source is ambiguous. Neither edge-clarity nor any other rule sees junction-mediated discontinuity or wire-touch ambiguity.

### S3 — edit probe: add Suspended (Connected suspend(), Degraded quarantine, → Reconnecting resume window), solid violet, without crowding
- session/container: 3ddca88f-621f-4223-a0b3-47ba46e43cb8 / 24697fbb-54a0-50ec-b122-fa8651ce0ca1
- outcome: proposal-ready in ~2.5 min → accepted. 5 ops only (1 addObject, 3 addConnection, 1 updateObject moving Reconnecting right for room) — surgical, no unrequested rewrites.
- diagnostics story — the labeled-edge check earned its keep here:
  - t6: **E1 label-clearance** ("packet loss > 5%" chip vs new "suspend()" chip) + **W1 spacing: "labeled edge state-degraded↔state-suspended: 96px gap is too tight for its 'quarantine' chip (give it ≥136px so the label breathes)"** — HEEDED, Suspended moved.
  - t7: **W1 spacing again with a concrete target** ("resume window" chip: 112px < 160px) — HEEDED, Suspended + Reconnecting repositioned.
  - Final: 2 hub-balance warnings OVERRIDDEN, verbatim: "intentionally retaining hub-balance warnings W1 and W2 for the routing corridor".
- renders: 5, iterating between every ops round.
- aesthetic (anchored): **6.5 / 10** vs reference 7.5. Delta sentence: the violet cluster sits on its own upper lane with every chip clear (crop-s3-violet-cluster.png) — matching the reference's clear-air standard — but adds two edge crossings (suspend()×grace-expired, resume-window×grace-expired) where the reference would have re-laned to avoid them, and inherits S2's dead lower frame.
- v3 delta, direct apples-to-apples (same instruction as v3 S3): v3 committed this at 4/5 WITH a chip-on-chip overlap ("quarantine" on "session resumed") that lint couldn't see; v4's spacing/label-clearance checks caught chip crowding twice mid-flight and the commit has zero chip contacts. The v3 blind spot ("lint's overlap findings don't see connection-label chips") is closed.

## Rule-efficacy table

| rule | fired (times) | heeded / quickfixed / overridden | correct? | verdict |
|------|------|------|------|------|
| spacing — labeled-edge breathing check | 3 (S2 t8; S3 t6, t7) | heeded all 3 (geometry moves, no quickfix used) | Yes — both S3 firings named the exact chip and a concrete px target (≥136 / ≥160), and the resulting layouts visibly read better; no false positives | **WORKING** — the round's new check did precisely what Ford's "too close together" critique demanded |
| spacing — general ladder | 1 (S2 t8, 48px off-ladder gap) | heeded | Yes, minor | WORKING (low volume) |
| grid | 0 | — | All observed op geometry was 16px-aligned (688/704/224/96…), so nothing to catch; v3's off-grid solver output did not reproduce because no re-solve was ever triggered | QUIET (untested this round) |
| section-trim | 0 | — | Single locked page-frame only; no sections created despite "reference finish" ask — see change 2 | QUIET |
| registers | 0 | — | Spine self-aligned (all states share y-lanes); no visible register misses | QUIET |
| hub-balance | 5 firings across S1/S2/S3 | 2 sessions overridden with verbatim notes; incidentally resolved in S2 | Mixed: technically correct measurements, but it fires on every deliberate left-to-right spine and both overrides were the RIGHT call — it is training the agent that warnings are ignorable | **MISCALIBRATED** — suppress or downweight when a dominant-axis spine exists (e.g. when >70% of edges flow one axis) |
| rhythm | 0 | — | no visible rhythm defect in outputs | QUIET |
| density | 0 | — | **Visible miss**: S2 was explicitly told "rebalance so it reads at a glance" and finished lint-clean with the bottom ~40% of the locked 2752×1744 frame empty; the reference boards never strand this much dead frame. No rule measures content-vs-frame occupancy | **BLIND** — needs a frame-balance/occupancy check |
| label-clearance | 6 (S1 t3; S2 t2/t4/t6/t10; S3 t6) | heeded every time; error tier gated commit | Yes — every firing was a real chip-on-chip or chip-on-object collision, including against the heartbeat badge; zero false positives; closed v3's chip blind spot | **WORKING** — the single most valuable rule this round |
| overlap (object-object) | 0 | — | no object overlaps occurred to test it | QUIET |
| containment | 0 | — | **Visible near-miss**: the heartbeat badge is anchored to nothing; by S2 it reads as a label on an unrelated wire. Containment-class rules don't cover annotation attachment | BLIND for badge/annotation anchoring (see change 3) |
| edge-clarity (incl. anti-parallel) | 1 (S1 t3: "edge-connect and edge-timeout run anti-parallel between seed-idle and state-connecting") | heeded — timeout rebuilt as elevated junction corridor | The firing itself was exactly right (this is the pair that shipped as a fake-bidirectional arrow in old S1b) and the fix is legible. But: (a) the only workaround the toolset offers is or-junction waypoint objects, which render as bare crosshair glyphs with arrowheads terminating INTO them — machinery the reference never shows; (b) it did NOT fire on S2's packet-loss wire merging into the session-resumed corridor bend, a same-class source-ambiguity | **WORKING but under-covered** — add junction-discontinuity / wire-touch detection, and give the router a real parallel-offset primitive so the fix doesn't cost three crosshairs |
| color-contrast | 0 | — | colors all semantic and legible; nothing to catch | QUIET |

Commit-gate note: the error-tier-only gate behaved correctly all round — E1 label-clearance blocked until fixed; warnings passed with explicit override notes in the commit summary (verbatim quotes above), which is exactly the audit trail the design wanted.

Self-loop carve-out (v3's blocker): resolved at the prompt level, not the tooling level. The agent no longer attempts self-edges (v3: bogus "endpoints unavailable" refusal → destructive whole-board re-solve). It goes straight to a badge and declares it in the commit summary. Cost: the badge is a floating, unanchored pill — semantically present, visually orphaned.

## Top 3 changes for Round 2

1. **Parallel-offset / labeled-waypoint routing primitive (or invisible junctions).** Grounded moment: S1 t5 thinking "Evaluating anti-parallel edge workarounds → Proposing junction nodes for labeling" — the agent's ONLY way to satisfy edge-clarity + label-clearance on the Idle↔Connecting pair was to invent three or-junction objects, which render as crosshair glyphs with terminal arrowheads (crop-s1-timeout-junctions.png, crop-s2-heartbeat-junction.png) and then pollute all later sessions. Either let a connection carry offset/waypoints+label natively, or render or-junctions as invisible pass-throughs with continuous arrow flow. This single change is worth ~1 full anchored point on every state-machine board.
2. **Frame-occupancy / balance diagnostic.** Grounded moment: S2 committed "Rebalanced the state machine…" with DIAGNOSTICS clean while 40% of the locked frame is empty and all mass is top-packed (s2-draft.png vs ref-gc.svg.png). A warning like "content occupies 58% of frame, center of mass at (0.45, 0.31) — spread vertically or shrink the frame" would have given the readability-probe instruction something to push against.
3. **Badge/annotation anchoring rule + self-loop badge guidance upgrade.** Grounded moment: the heartbeat pill was placed free-floating in S1 and by S2's geometry pass sat beside the recovered-junction wire, where it reads as that wire's label (crop-s2-heartbeat-junction.png). Prompt guidance should say "attach the badge to its host state (contained overlap or a short stub connector)", and a warning should fire on any annotation-class object that neither touches nor connects to anything. Secondary tuning in the same change: suppress hub-balance when a dominant-axis spine is detected — both of this round's overrides were correct rejections of the rule, and repeated correct overrides erode warning authority.

## Verdict vs baselines

Old system: build 2/5 with 14 failed calls; styling and nudge requests abandoned outright. v3: surgical restyles landed at 4/5 but self-loops were board-wrecking and chip overlaps invisible to lint. v4 round 1: all three sessions committed clean on the first proposal, zero failed calls, the two rules under scrutiny (labeled-edge spacing, edge-clarity anti-parallel) both fired at the right moments and were heeded, and the v3 chip-overlap blind spot is closed. Anchored honestly against the reference boards the outputs sit at 6–6.5 vs the bar's 7.5 — the remaining gap is not crowding anymore; it is routing machinery leaking into the drawing, dead frame, and unanchored annotations.
