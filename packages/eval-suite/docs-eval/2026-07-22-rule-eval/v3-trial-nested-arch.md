# v3 trial — nested architecture diagram

Canvas: eval-v3-nested-arch · Sessions run: 5 (4 battery + 1 gate/re-solve probe) · Date: 2026-07-22
Old baseline: `findings-nested-arch.md` (6 sessions, 35 parse retries, 2 abandons, 1 operator reject).

All five sessions committed and were accepted + materialized (PUT via :4000). Note: the studio
proxy at :3999 was down for this trial; :4000 served both the canvas API and kernel evidence.

## Sessions

### S1 — build: Production VPC with Edge/Services/Data tinted groups, emphasized Event Bus hub, 8 labeled edges (async dashed), semantic colors, margin sticky
- session/container: d85544d7-22c3-4338-a48e-e06dfa5a5021 / 39219ce9-4eed-5e36-8a64-1fcedc1e97ba
- outcome: committed (propose_program parse retries: **0** — propose_program was never called)
- tool sequence: fit_scope → apply_ops(21 ops) → render_draft → apply_ops(group-fit adjustments) → render_draft → commit (6 turns)
- proposal op mix: `Counter({addObject: 11, addConnection: 8, updateObject: 2})`
- aesthetic: 4 — clean left-to-right three-group read with a visibly emphasized orange hub, every edge labeled, async dashed; residual router flaws only (anti-parallel dashed pair left of the bus, long purple/gray detours for the read/write edges, "invoice.issued" label crowding a "read/write" pill).
- group hug measurement: Edge 448×608, Services 944×608, Data 448×608 — vs old S1's 592×1616 stretched towers. Content slack ≈ 96px per group. Hugging achieved on first build.
- delta vs old S1: old — 21 consecutive parse failures before the first draft, then committed 1616px-tall empty towers (aesthetic 2) / new — zero retries, six turns, hugging groups, labels+dash+colors+sticky all present in one pass (aesthetic 4). The 21-retry grammar fight is simply gone because the agent never touches the DSL.

### S2 — surgical probe: "move the Event Bus ~20px left and enlarge it slightly; change nothing else"
- session/container: a8c0c166-de7d-40a4-bfe5-bb7f9b176e6b / 437c4985-7eba-5b36-ae71-877e5aa6a352
- outcome: committed (retries: 0)
- tool sequence: fit_scope → apply_ops → render_draft (local 512×352 crop) → commit (4 turns)
- proposal op mix: `Counter({updateObject: 1})` — single op: seed-bus geometry (1248,768,288×144) → (1216,768,320×160)
- aesthetic: 5 — exactly the asked-for change, on-grid (32px left, slight enlarge), literally nothing else in the delta.
- size-survival check (old S2's silent L→M shrink): bus GREW as requested and no other object was re-serialized — the fit_scope size-class round-trip that shrank the hub in the old eval never runs under apply_ops.
- defect (minor): commit summary says "moved 16px left" but the delta is 32px — honest-summary rule violated on arithmetic, not on substance.
- delta vs old S4 (same request class): old — abandoned after 6 invented-syntax attempts ("no exact pixel-offset operation") / new — committed in 4 turns with a 1-op delta.

### S3 — restyle probe: "label every currently-unlabeled edge; recolor Data-group edges orange"
- session/container: de467d53-71e4-4d82-b45d-590b52519bb7 / 42597fc3-b3ed-5f7c-8c4b-366a5067a11b
- outcome: committed (retries: 0)
- tool sequence: fit_scope → apply_ops → render_draft → commit (4 turns)
- proposal op mix: `Counter({updateConnection: 3})` — color patches on existing ids edge-inventory-postgres, edge-orders-postgres, edge-billing-redis
- aesthetic: 5 — op semantics exactly right; **zero duplicate addConnection edges**; the label half was a deliberate trap (all 8 edges were already labeled) and the agent recognized it and said so in the summary instead of inventing work.
- delta vs old eval: no equivalent was possible — the old DSL had no connector channels at all; the class of request that killed old S5 ("prohibited from editing…") is now a 3-op patch.

### S4 — structural: "add Notifications Service inside Services group, wired dashed-orange from the bus; preserve every label/style/color/size; groups keep hugging"
- session/container: b7d69ee8-b901-4739-8b9b-47775a1240d8 / 044877d9-4010-5ef9-a00d-ee8180a7cc84
- outcome: committed (retries: 0)
- tool sequence: fit_scope → inspect → apply_ops(add node+edge) → render_draft → apply_ops(rebalance bus/inventory) → apply_ops(fine-tune) → render_draft → commit (8 turns, 2 renders, iterated after looking)
- proposal op mix: `Counter({updateObject: 2, addObject: 1, addConnection: 1})`
- aesthetic: 4 — Notifications slots into a balanced 4-around-the-hub arrangement fully inside its parent (bottom 1072 < group bottom 1104); all 8 pre-existing connections byte-identical; label pile-up near the bus NE corner ("invoice.issued" clipped under "read/write") and the bus→inventory dashed edge takes a long under-hub detour.
- new-node label check (old S2's "notifications-se rvice" id-as-label defect): node text is the display string "Notifications Service", id is `notifications-service` — the label/id split works.
- gate behavior: never fired — the agent never produced an escape. Every apply_ops result carried the warning-mode check ("Document gate warnings: none"), so the doc-level gate is demonstrably wired in, but this trial produced no verbatim block message to record.
- channel-loss-through-re-solve: **not exercised** — the agent chose pure apply_ops and never called propose_program or solve_layout, so there was no re-solve to lose channels through.
- delta vs old S2 (same request class): old — first-solve success but label rendered as raw id and the hub silently shrank L→M / new — correct display label, hub untouched except its own requested move, zero collateral.

### S5 — gate/re-solve probe (old-S6 replica): "tighten vertical spacing inside the Data group; group hugs; keep exact horizontal position; change nothing outside"
- session/container: 64979015-4ce7-43ab-a053-0704fd52bd05 / ecc4bafa-2a3a-5396-be20-7f9611511068
- outcome: committed (retries: 0)
- tool sequence: fit_scope → inspect → apply_ops → render_draft → commit (5 turns)
- proposal op mix: `Counter({updateObject: 2})` — redis-cache y 928→752 (32px stack gap), data-group height 608→432
- aesthetic: 4.5 — precisely the requested tighten+hug; data-group x stayed 1888 to the pixel.
- delta vs old S6: old — 7 solved drafts all pushed the Data section 164–284px east, committed with the child 132px outside its parent VPC, operator REJECTED / new — 2-op patch, zero drift, zero expulsion, committed clean. The nested-section re-solve failure mode is not "fixed" — it is *routed around*: nothing forces the solver into the loop for an edit like this anymore.

## Parse-retry delta

| | old eval | v3 trial |
|---|---|---|
| S1-class build | 21 | 0 |
| whole battery | 35 across 6 sessions | **0 across 5 sessions** |

The retries didn't get better — the failure surface was removed. `propose_program` (the only
parse-able tool) was invoked **zero times** in the entire trial; every session went fit_scope →
apply_ops → render → commit.

## What v3 fixed (vs old findings)

- **MECH: DSL expressiveness (4×BLOCKED old)** — dead as a failure class. The 21-retry grammar fight (old S1), the id-as-label defect (old S2), the scope-frame trap (old S4), and the no-text-editing abandon (old S5) all have direct-op answers; S2/S3/S5 here are the request classes that previously abandoned, each landing in ≤5 turns.
- **MECH: size normalization (old S2 silent L→M hub shrink)** — gone; apply_ops never re-serializes unrelated objects, verified byte-stable across S2–S5.
- **MECH: solver collapse / nested-section (old S1 stretched towers, old S6 child expulsion)** — avoided rather than repaired: groups were sized by explicit geometry and hugged from the first build (448/944/448 × 608 vs 592×1616), and the old-S6 replica produced zero drift because no re-solve ran.
- **R10 language-refusal (2 abandons old)** — both refusal classes (pixel nudge, connector styling) are now ordinary ops; 0 abandons this trial.
- **MECH: single-render habit** — improved: every session rendered before committing, and S1/S4 iterated with a second apply_ops round after looking. Renders were also sensibly scoped (S2 rendered a 512×352 local crop).
- Connection inventory in fit_scope (ids + channels) is what made S3's updateConnection-by-id addressing possible — old findings' "only learnable from fit_scope echoes" complaint is moot.

## What v3 did not fix (known router limits + untested claims)

- Router flaws persist exactly as flagged out-of-scope: anti-parallel dashed overlap left of the bus (S1/S4), long lane-crossing detours for the Orders/Inventory→Postgres and Billing→Redis edges, and label collisions where two edge labels land in the same corridor ("invoice.issued" clipped under "read/write" in S1 and S4 — visible in both committed renders).
- **The two headline v3 mechanisms were never actually exercised**: propose_program channel preservation (§D) and the hard commit gate (§E block path) went untested because the agent never chose a re-solve and never authored a violation. The gate's warning-mode plumbing is confirmed present in every apply_ops result; its blocking behavior remains an untested claim for this diagram type. No verbatim gate message exists to record.
- The compact diagram still floats in the top half of the locked 2736×1936 page-frame (old S3's residual note) — nobody asked to fix it, nobody did.

## New defects v3 introduced

- **Commit-summary arithmetic**: S2's summary claims "16px left" for a 32px move (delta says 32). Harmless here, but the "honest commit summaries" mandate is only as honest as the agent's subtraction — evidence: S2 turn 3 commit vs the 1-op geometry delta.
- No duplicate edges, no channel loss, no gate false-positives observed. (Operational nit, pre-existing: the session GET response embeds a raw control character that breaks strict JSON parsers — parse with strict=False.)

## Verdict

**Ready to scale for nested architecture diagrams.** Every request class that scored BLOCKED or
abandoned in the old eval committed cleanly here, with 0 parse retries, 0 abandons, 0 duplicate
edges, and channel state byte-stable across four stacked edit sessions. The one caveat for the
scorecard: v3's win on this type comes from the agent abandoning the solver entirely (100%
apply_ops), which means the re-solve channel-preservation path and the hard gate are still
unproven in live use — a future battery should force a whole-scope propose_program (e.g. "re-lay
the whole VPC top-to-bottom") to certify them before trusting re-solve-heavy diagram types.
