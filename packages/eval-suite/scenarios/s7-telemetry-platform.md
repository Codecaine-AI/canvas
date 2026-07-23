# S7 — Telemetry ingestion & incident triage platform

<!-- Fixture contract: this file alone must be enough to (a) run the scenario from a blank
canvas and get a comparable board every time, and (b) grade all five axes. The build
instruction is the canonical source of intent; every table below restates the instruction
precisely — the checklist may never demand anything the instruction doesn't ask for. -->

- id: `s7-telemetry-platform`
- canvas: `eval-suite-s7-telemetry-platform` (created fresh every run; delete any existing first)
- genre: composite: multi-region system map (gc-decomp-harness class, fresh domain)
- complexity: 5
- board: 3200×2000 locked `page-frame`
- session budget: 1 build session + 3 edit sessions, 15 min poll cap each
- scale: 32 objects (23 nodes + 6 sections + 3 stickies), 27 edges at build; E1 adds 1 section + 2 nodes + 2 edges

## Build instruction (verbatim — send exactly this)

> Build me a system map of our telemetry ingestion & incident triage platform — reference-board quality, the kind you'd pin up: tinted regions doing real grouping work, labeled colored corridors between them, margin notes, deliberate density variation, and room for every label to breathe. The frame is 3200×2000 and locked.
>
> Cast, by region — six tinted regions plus one free-standing actor:
>
> - An **"On-call operator"** actor, top-center, outside any region.
> - **"Sources / Config"** (green tint, along the left edge): "Agent fleet (hosts)", "Config registry", "Telemetry secrets (collector tokens)".
> - **"Ingest Loop"** (teal tint, upper-center — this is the hero region, biggest and most detailed): "Ingest gateway", "Stream buffer", "Enrichment (tags + geo)", "Router". This is the main pipeline; give it the hero treatment.
> - **"State substrate"** (gray tint, a wide flat band across the middle of the board): "Hot store (7d)", "Cold archive (S3)", "Retention policy".
> - **"Alert gate"** (violet tint, a vertical checklist-style column right-of-center): "Threshold eval", then "Dedup + grouping", then an "Escalate?" decision diamond in orange, then its two outcomes: "Page on-call", and "Suppress (log only)" in red.
> - **"Knowledge"** (pink tint, top-right): "Runbooks", "Postmortem indexer", "Knowledge graph (kg.sqlite)".
> - **"Incident handoff"** (orange tint, right side): "Triage splitter", "Incident reviewer", "Remediation fixer", "Status page".
>
> Wiring. Color the flows by family, and label every corridor that crosses a region boundary — those corridor labels are the point of the board:
>
> - Ingest family (teal, solid): Agent fleet (hosts) → Ingest gateway labeled "raw events"; Ingest gateway → Stream buffer labeled "buffer"; Stream buffer → Enrichment (tags + geo) labeled "drain"; Enrichment (tags + geo) → Router (no label); Router → Hot store (7d) labeled "enriched stream".
> - Config support (gray, solid): Config registry → Ingest gateway labeled "collector config"; Config registry → Threshold eval labeled "alert rules"; Telemetry secrets (collector tokens) → Ingest gateway labeled "auth tokens"; On-call operator → Config registry labeled "tune configs".
> - State internal (gray, solid): Hot store (7d) → Cold archive (S3) labeled "age out"; Retention policy → Cold archive (S3) labeled "expiry rules".
> - Alerting family (orange, solid): Router → Threshold eval labeled "alert candidates"; Threshold eval → Dedup + grouping labeled "grouped"; Dedup + grouping → Escalate? (no label); Escalate? → Page on-call labeled "yes · page"; Escalate? → Suppress (log only) labeled "no · suppress"; Page on-call → Triage splitter labeled "page"; Page on-call → On-call operator labeled "wake on-call"; and Suppress (log only) → Hot store (7d) labeled "log only" in gray.
> - Handoff chain (orange, solid): Triage splitter → Incident reviewer labeled "assigned"; Incident reviewer → Remediation fixer labeled "root cause"; Remediation fixer → Status page labeled "status updates".
> - Knowledge family (pink, solid): Incident reviewer → Postmortem indexer labeled "distill lessons"; Postmortem indexer → Knowledge graph (kg.sqlite) labeled "write facts"; Runbooks → Incident reviewer labeled "runbook steps".
> - Two dashed feedback loops, each in its own color, each crossing the board: Knowledge graph (kg.sqlite) → Threshold eval, dashed green, labeled "tuning hints"; and Cold archive (S3) → Ingest gateway, dashed violet, labeled "replay".
>
> Three tan margin stickies stacked down the left margin, outside every region: (1) a platform summary — "Streaming telemetry control plane: deterministic ingest owns ordering + enrichment; alerting is threshold- and dedup-gated; humans triage what pages."; (2) a coordination note — "Coordination via hot store + retention policy — services never touch each other's disks."; (3) a human-in-the-loop note — "A human acknowledges every page. Suppressed alerts are logged, never dropped."
>
> Finish standards: every corridor label owns clear air and none sits on a crossing; density should vary deliberately (Ingest Loop dense and detailed, State substrate wide and flat); no routing machinery visible — no junction glyphs, no arrowheads terminating into waypoints, no wires merging ambiguously. House reference quality.

## Ground truth

### Nodes

| ref | label (verbatim) | kind/shape | color-class | notes |
|---|---|---|---|---|
| n1 | On-call operator | actor | green | top-center, outside all regions |
| n2 | Agent fleet (hosts) | process | green | in sec1 |
| n3 | Config registry | process | green | in sec1 |
| n4 | Telemetry secrets (collector tokens) | process | green | in sec1 |
| n5 | Ingest gateway | process | teal | in sec2; entry point of hero pipeline |
| n6 | Stream buffer | process | teal | in sec2 |
| n7 | Enrichment (tags + geo) | process | teal | in sec2 |
| n8 | Router | process | teal | in sec2; forks to state + alerting |
| n9 | Hot store (7d) | store | gray | in sec3 |
| n10 | Cold archive (S3) | store | gray | in sec3 |
| n11 | Retention policy | process | gray | in sec3 |
| n12 | Threshold eval | process | violet | in sec4, checklist top |
| n13 | Dedup + grouping | process | violet | in sec4 |
| n14 | Escalate? | decision diamond | orange | in sec4 |
| n15 | Page on-call | process | violet | in sec4, "yes" outcome |
| n16 | Suppress (log only) | process | red | in sec4, "no" outcome |
| n17 | Runbooks | process | pink | in sec5 |
| n18 | Postmortem indexer | process | pink | in sec5 |
| n19 | Knowledge graph (kg.sqlite) | store | pink | in sec5 |
| n20 | Triage splitter | process | orange | in sec6 |
| n21 | Incident reviewer | process | orange | in sec6 |
| n22 | Remediation fixer | process | orange | in sec6 |
| n23 | Status page | process | orange | in sec6 |

<!-- ref is a stable handle for this file (n1, n2…) — the agent chooses its own ids. -->

### Edges

| ref | from → to | label | style | color-class | notes |
|---|---|---|---|---|---|
| e1 | n2 → n5 | raw events | solid | teal | corridor sec1→sec2 |
| e2 | n5 → n6 | buffer | solid | teal | |
| e3 | n6 → n7 | drain | solid | teal | |
| e4 | n7 → n8 | — | solid | teal | interior, unlabeled |
| e5 | n8 → n9 | enriched stream | solid | teal | corridor sec2→sec3 |
| e6 | n3 → n5 | collector config | solid | gray | corridor sec1→sec2 |
| e7 | n3 → n12 | alert rules | solid | gray | corridor sec1→sec4, long run |
| e8 | n4 → n5 | auth tokens | solid | gray | corridor sec1→sec2 |
| e9 | n1 → n3 | tune configs | solid | gray | actor → sec1 |
| e10 | n9 → n10 | age out | solid | gray | interior sec3 |
| e11 | n11 → n10 | expiry rules | solid | gray | interior sec3 |
| e12 | n8 → n12 | alert candidates | solid | orange | corridor sec2→sec4 |
| e13 | n12 → n13 | grouped | solid | orange | |
| e14 | n13 → n14 | — | solid | orange | interior, unlabeled |
| e15 | n14 → n15 | yes · page | solid | orange | decision branch |
| e16 | n14 → n16 | no · suppress | solid | orange | decision branch |
| e17 | n15 → n20 | page | solid | orange | corridor sec4→sec6 |
| e18 | n15 → n1 | wake on-call | solid | orange | sec4 → actor |
| e19 | n16 → n9 | log only | solid | gray | corridor sec4→sec3 |
| e20 | n20 → n21 | assigned | solid | orange | |
| e21 | n21 → n22 | root cause | solid | orange | |
| e22 | n22 → n23 | status updates | solid | orange | |
| e23 | n21 → n18 | distill lessons | solid | pink | corridor sec6→sec5 |
| e24 | n18 → n19 | write facts | solid | pink | interior sec5 |
| e25 | n17 → n21 | runbook steps | solid | pink | corridor sec5→sec6 |
| f1 | n19 → n12 | tuning hints | dashed | green | feedback loop, crosses board right→center |
| f2 | n10 → n5 | replay | dashed | violet | feedback loop, crosses board bottom→upper-left; E3 target |

### Sections / groups

| ref | title | tint | members (node refs) | nesting |
|---|---|---|---|---|
| sec1 | Sources / Config | green | n2, n3, n4 | top-level |
| sec2 | Ingest Loop | teal | n5, n6, n7, n8 | top-level; hero region — largest, densest |
| sec3 | State substrate | gray | n9, n10, n11 | top-level; wide flat band mid-board |
| sec4 | Alert gate | violet | n12, n13, n14, n15, n16 | top-level; vertical checklist column |
| sec5 | Knowledge | pink | n17, n18, n19 | top-level; top-right |
| sec6 | Incident handoff | orange | n20, n21, n22, n23 | top-level; right side |

### Annotations

| ref | kind | gist | placement |
|---|---|---|---|
| st1 | tan margin sticky | "Streaming telemetry control plane: deterministic ingest owns ordering + enrichment; alerting is threshold- and dedup-gated; humans triage what pages." | left margin, top of stack, outside all regions |
| st2 | tan margin sticky | "Coordination via hot store + retention policy — services never touch each other's disks." | left margin, middle of stack |
| st3 | tan margin sticky | "A human acknowledges every page. Suppressed alerts are logged, never dropped." | left margin, bottom of stack |

## Comprehension key

CORE:
- [C1] The board depicts a telemetry ingestion and incident triage platform (events flow in from a fleet, get stored and alerted on, incidents are triaged by humans).
- [C2] The main pipeline runs Agent fleet → Ingest gateway → Stream buffer → Enrichment → Router, in that order ("raw events" enters it).
- [C3] The Router feeds the Hot store via a corridor labeled "enriched stream" — storage receives *enriched*, not raw, data.
- [C4] The Router also feeds the alerting column via a corridor labeled "alert candidates" — alerting taps the pipeline at the Router.
- [C5] The Alert gate is an ordered checklist: Threshold eval → Dedup + grouping → an "Escalate?" decision with exactly two outcomes, page vs suppress.
- [C6] Paging goes to the Incident handoff region (corridor labeled "page" into Triage splitter) and also wakes the On-call operator.
- [C7] The handoff chain runs Triage splitter → Incident reviewer → Remediation fixer → Status page, in that order.
- [C8] Lessons flow out of triage into Knowledge: Incident reviewer → Postmortem indexer ("distill lessons") → Knowledge graph ("write facts").
- [C9] A dashed green feedback loop runs FROM the Knowledge graph BACK TO Threshold eval, labeled "tuning hints" — knowledge tunes the alerting.
- [C10] A dashed violet feedback loop runs FROM the Cold archive BACK TO the Ingest gateway, labeled "replay" — archived data can re-enter ingest.
- [C11] Six named regions exist and their purposes are recoverable: sources/config feeds in, an ingest loop processes, a state substrate stores, an alert gate decides, knowledge accumulates, incident handoff resolves.
- [C12] The Hot store ages out to the Cold archive, and the Retention policy governs the archive's expiry.
- [C13] The Config registry supplies BOTH the ingest side ("collector config") and the alerting side ("alert rules") — one registry, two consumers.
- [C14] Suppressed alerts are not dropped: "Suppress (log only)" writes to the Hot store ("log only").

SECONDARY:
- [S1] The On-call operator tunes configs (operator → Config registry, "tune configs").
- [S2] Telemetry secrets provide "auth tokens" to the Ingest gateway.
- [S3] The Ingest Loop reads as the hero region — visibly larger/denser than the others; the State substrate reads as a wide flat band.
- [S4] Three margin notes exist and their gists are recoverable: platform summary, no-shared-disk coordination, human acknowledges every page / suppressed is logged.
- [S5] Color families are consistent: teal = ingest path, orange = alerting/handoff, pink = knowledge.
- [S6] Dashed means feedback/advisory (both dashed edges point backwards against the main flow).
- [S7] "Escalate?" is a decision diamond.
- [S8] "Suppress (log only)" is the red node — the reject outcome.
- [S9] Runbooks feed the Incident reviewer ("runbook steps").
- [S10] The Status page receives "status updates" from the Remediation fixer.

## Intent-fidelity checklist

Actor and Sources / Config:
- [ ] IF-SC-01 node n1 exists, label "On-call operator", actor kind, top-center, outside every section
- [ ] IF-SC-02 node n2 exists, label "Agent fleet (hosts)", green
- [ ] IF-SC-03 node n3 exists, label "Config registry", green
- [ ] IF-SC-04 node n4 exists, label "Telemetry secrets (collector tokens)", green
- [ ] IF-SC-05 section sec1 exists, title "Sources / Config", green tint, members exactly {n2, n3, n4}
- [ ] IF-SC-06 edge e9 n1 → n3, label "tune configs", solid gray

Ingest Loop:
- [ ] IF-IL-01 node n5 exists, label "Ingest gateway", teal
- [ ] IF-IL-02 node n6 exists, label "Stream buffer", teal
- [ ] IF-IL-03 node n7 exists, label "Enrichment (tags + geo)", teal
- [ ] IF-IL-04 node n8 exists, label "Router", teal
- [ ] IF-IL-05 section sec2 exists, title "Ingest Loop", teal tint, members exactly {n5, n6, n7, n8}
- [ ] IF-IL-06 sec2 reads as the hero region: largest area and/or densest interior of the six (PNG check)
- [ ] IF-IL-07 edges e2 (n5→n6 "buffer"), e3 (n6→n7 "drain"), e4 (n7→n8 unlabeled) all present, solid teal, correct direction

State substrate:
- [ ] IF-SS-01 node n9 exists, label "Hot store (7d)", gray
- [ ] IF-SS-02 node n10 exists, label "Cold archive (S3)", gray
- [ ] IF-SS-03 node n11 exists, label "Retention policy", gray
- [ ] IF-SS-04 section sec3 exists, title "State substrate", gray tint, members exactly {n9, n10, n11}
- [ ] IF-SS-05 sec3 is a wide flat band mid-board — width clearly dominates height (PNG check)
- [ ] IF-SS-06 edge e10 n9 → n10, label "age out", solid gray
- [ ] IF-SS-07 edge e11 n11 → n10, label "expiry rules", solid gray

Alert gate:
- [ ] IF-AG-01 node n12 exists, label "Threshold eval", violet
- [ ] IF-AG-02 node n13 exists, label "Dedup + grouping", violet
- [ ] IF-AG-03 node n14 exists, label "Escalate?", decision-diamond shape, orange
- [ ] IF-AG-04 node n15 exists, label "Page on-call", violet
- [ ] IF-AG-05 node n16 exists, label "Suppress (log only)", red
- [ ] IF-AG-06 section sec4 exists, title "Alert gate", violet tint, members exactly {n12, n13, n14, n15, n16}
- [ ] IF-AG-07 sec4 reads as a vertical column — checklist order n12 above n13 above n14, outcomes below the diamond (PNG check)
- [ ] IF-AG-08 edge e13 n12 → n13, label "grouped", solid orange
- [ ] IF-AG-09 edge e14 n13 → n14, solid orange, unlabeled
- [ ] IF-AG-10 edge e15 n14 → n15, label "yes · page", solid orange
- [ ] IF-AG-11 edge e16 n14 → n16, label "no · suppress", solid orange
- [ ] IF-AG-12 edge e19 n16 → n9, label "log only", solid gray

Knowledge:
- [ ] IF-KN-01 node n17 exists, label "Runbooks", pink
- [ ] IF-KN-02 node n18 exists, label "Postmortem indexer", pink
- [ ] IF-KN-03 node n19 exists, label "Knowledge graph (kg.sqlite)", pink
- [ ] IF-KN-04 section sec5 exists, title "Knowledge", pink tint, members exactly {n17, n18, n19}, placed top-right
- [ ] IF-KN-05 edge e24 n18 → n19, label "write facts", solid pink

Incident handoff:
- [ ] IF-IH-01 node n20 exists, label "Triage splitter", orange
- [ ] IF-IH-02 node n21 exists, label "Incident reviewer", orange
- [ ] IF-IH-03 node n22 exists, label "Remediation fixer", orange
- [ ] IF-IH-04 node n23 exists, label "Status page", orange
- [ ] IF-IH-05 section sec6 exists, title "Incident handoff", orange tint, members exactly {n20, n21, n22, n23}, right side
- [ ] IF-IH-06 edges e20 (n20→n21 "assigned"), e21 (n21→n22 "root cause"), e22 (n22→n23 "status updates") present, solid orange, correct order

Cross-region corridors (all labels must be present, legible, and visually owned by their runs):
- [ ] IF-CO-01 edge e1 n2 → n5, label "raw events", solid teal
- [ ] IF-CO-02 edge e5 n8 → n9, label "enriched stream", solid teal
- [ ] IF-CO-03 edge e6 n3 → n5, label "collector config", solid gray
- [ ] IF-CO-04 edge e7 n3 → n12, label "alert rules", solid gray
- [ ] IF-CO-05 edge e8 n4 → n5, label "auth tokens", solid gray
- [ ] IF-CO-06 edge e12 n8 → n12, label "alert candidates", solid orange
- [ ] IF-CO-07 edge e17 n15 → n20, label "page", solid orange
- [ ] IF-CO-08 edge e18 n15 → n1, label "wake on-call", solid orange
- [ ] IF-CO-09 edge e23 n21 → n18, label "distill lessons", solid pink
- [ ] IF-CO-10 edge e25 n17 → n21, label "runbook steps", solid pink

Feedback loops:
- [ ] IF-FB-01 edge f1 n19 → n12 exists, label "tuning hints", DASHED, green — direction knowledge→gate, not reversed
- [ ] IF-FB-02 edge f2 n10 → n5 exists, label "replay", DASHED, violet — direction archive→gateway, not reversed
- [ ] IF-FB-03 f1 and f2 use two visibly different colors from each other and from every solid family

Annotations:
- [ ] IF-AN-01 sticky st1 present, tan, gist = platform summary as specced, left margin
- [ ] IF-AN-02 sticky st2 present, tan, gist = no-shared-disk coordination note, left margin
- [ ] IF-AN-03 sticky st3 present, tan, gist = human-acknowledges / suppressed-is-logged note, left margin
- [ ] IF-AN-04 all three stickies sit outside every section, stacked in the left margin

Negative checks:
- [ ] IF-NEG-1 no specced node/edge/section/sticky absent without a declared substitution in a commit summary
- [ ] IF-NEG-2 no unrequested structural content (nodes/sections/edges beyond spec + declared substitutions)
- [ ] IF-NEG-3 no routing machinery: no junction glyphs, no arrowheads terminating into waypoints, no orphaned/floating badges
- [ ] IF-NEG-4 no corridor label detached from its run (a label chip nearer to a different edge than its own is a fail)
- [ ] IF-NEG-5 both dashed edges are the ONLY dashed edges on the board (dashed = feedback convention holds)

## Follow-up edits

### E1 — Add the Surfaces region

Instruction (verbatim):

> There's dead space along the bottom of the frame — add a seventh region there: "Surfaces" (gray tint) with two nodes, "API server" and "Ops dashboard". Wire API server → Ops dashboard labeled "live state" in gray, and API server → Hot store (7d) labeled "controls / status" in gray. Use the dead space — the six existing regions stay exactly where they are.

Fidelity checks (append to the running IF checklist):
- [ ] E1-01 section sec7 exists, title "Surfaces", gray tint, members exactly {n24, n25}, placed in previously empty bottom band
- [ ] E1-02 node n24 exists, label "API server", gray; node n25 exists, label "Ops dashboard", gray
- [ ] E1-03 edge e26 n24 → n25, label "live state", solid gray
- [ ] E1-04 edge e27 n24 → n9, label "controls / status", solid gray, corridor sec7→sec3
- [ ] E1-05 sec7 does not overlap any existing section or sticky

Stability invariants (ES):
- [inv] sections sec1–sec6: position and size unchanged (>16px shift or any resize = violation; the instruction says they stay exactly where they are, so no accommodation is expected)
- [inv] all 23 existing nodes n1–n23: position within 16px, style/label/parent unchanged
- [inv] all existing edges e1–e25, f1, f2: endpoints, style, color, label unchanged; no route visibly displaced into a different corridor
- [inv] stickies st1–st3 unchanged
- in-scope objects: n24, n25, sec7, e26, e27 (new only); n9 as connection target (must not move)

### E2 — Readability probe

Instruction (verbatim):

> Compare against our house standard: give every labeled corridor room to breathe, and rebalance so it reads at a glance — polish to reference quality.

Fidelity checks (append):
- [ ] E2-01 after-state: no edge label sits on a crossing or overlaps another label/node (PNG check)
- [ ] E2-02 after-state: no text-covering collisions anywhere; every corridor label chip has clear air on all sides
- [ ] E2-03 the board still fills the frame — no new large dead band created by the rebalance

Stability invariants (ES) — this edit is geometry-only:
- [inv] object count and connection count identical before/after (nothing added, nothing deleted)
- [inv] no label text changed on any node, edge, section, or sticky
- [inv] no color-class or dash-style changed anywhere
- [inv] section membership identical (no node re-parented)
- [inv] every edge keeps its endpoints and direction
- in-scope objects: everything, geometrically — position/size/route changes are the point of this edit and are not violations; anything non-geometric is out of scope entirely

### E3 — Give the replay loop its own corridor

Instruction (verbatim):

> The replay loop gets lost crossing the board — give it its own clear corridor with the label owning air, without disturbing the ingest spine.

Fidelity checks (append):
- [ ] E3-01 edge f2 still runs n10 → n5, still dashed, still violet, still labeled "replay"
- [ ] E3-02 f2's route no longer overlaps or shadows any solid edge run; the "replay" label chip has clear air and is unambiguously attached to f2 (PNG check)
- [ ] E3-03 f2 does not pass through the interior of any section it doesn't terminate in

Stability invariants (ES):
- [inv] only f2 may be rerouted; every other edge's route is unchanged
- [inv] the ingest spine e1–e5 untouched: routes, labels, styles identical
- [inv] all nodes within 16px of their pre-edit positions; sec1–sec7 positions/sizes unchanged (declared accommodations ≤16px only)
- [inv] f2 endpoints (n10, n5), style (dashed), color (violet), label ("replay") unchanged
- in-scope objects: f2 (route only)

## Grading notes

- **Machinery leakage is the top temptation at this scale.** 27+ edges across six regions is exactly where junction crosshairs, waypoint-terminating arrowheads, and ambiguous wire merges appear. The reference (gc-decomp-harness) shows zero machinery at comparable edge counts. Its *ugliness* is SQ's business; its *unrequestedness* is IF-NEG-3.
- **Corridor labels drifting from their runs.** With ten cross-region corridors, watch for label chips floating near-but-not-on their edges (old-system class) or nearer a neighboring run than their own. A drifted label is an IF-NEG-4 fail AND an IC hazard (the blind judge will attach it to the wrong edge — that's a corruption, not just a miss).
- **Region tint misuse.** Tints must do grouping work: a member node outside its region's bounds, a tint so faint the region boundary is unrecoverable, or two adjacent regions sharing an indistinguishable tint all defeat C11. Proximity-only grouping without tinted sections fails IF section items even if the PNG "looks grouped".
- **Feedback-loop direction.** f1 and f2 both point *against* the main flow. A reversed feedback edge is the single worst defect here: reversed-direction cap (IF ≤ 6) plus a corrupted CORE fact (IC ≤ 6).
- **The agent commits defects it has already seen.** Round-1 finding (scorecard.md, cross-cutting): every low-scoring commit shipped a defect the agent had demonstrably seen in its own render or been told about. PH judges: check whether long-corridor collisions visible in an intermediate render (e7 "alert rules" and f1/f2 are the likely victims) were fixed, declared, or silently committed — silent commit of a seen defect is the PH ≤ 4 class.
- **Do NOT double-penalize declared substitutions.** An honestly declared substitution in a commit summary (e.g. "decision diamond unsupported, used a badge-labeled box") fails its checklist item but does NOT trigger the silent-omission cap, and PH should credit the honesty. Same for declared E-session accommodations.
- **E2 is a probe, not a license.** The correct E2 diff is purely geometric. Any relabeling, restyling, or add/delete under E2 is an ES violation even if it "improves" the board. Conversely, large geometric movement under E2 is expected and must not be scored as churn.
- **Density variation is deliberate here.** Hero Ingest Loop vs flat State substrate is specced. Do not penalize the size disparity between regions as imbalance; DO penalize a dead frame band (pre-E1, the bottom band may legitimately be quiet — E1 exists to fill it; post-E1 it may not be empty).
