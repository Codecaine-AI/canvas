# v4 Round 1 — nested architecture diagram

Canvas: eval-v4-nested-arch · Sessions run: 3 (all committed + accepted + materialized via :4000 PUT) · Date: 2026-07-22
Baselines: `findings-nested-arch.md` (old DSL, aesthetic 2–3.5), `v3-trial-nested-arch.md` (apply_ops era, 4–5 unanchored).
Reference anchoring done FIRST: `gc-decomp-harness` (bar ≈ 7.5) and `intent-classification-2` (≈ 7) rendered at 2800px and
viewed before any session; every score below is a same-phase side-by-side against those PNGs.
Evidence dir (private scratchpad): `.../scratchpad/v4r1-nested/` — `ref-gc.svg.png`, `s1-draft-chrome.png`, `s1-crop-bus.png`,
`s2-draft-chrome.png`, `s2-crop-bus.png`, `s3-draft-chrome.png`, `s3-crop-cache.png`, `final.png`.

Operational notes: draft.svg ships `width="1400"`-ish attrs regardless of viewBox — rasterize after patching width/height
to the viewBox or the right half of wide boards silently disappears (qlmanage also mangles wide aspects; headless Chrome
at viewBox size is reliable). Session GET still embeds a control char (parse strict=False). No harness deaths; sessions
took 5–10 min each.

## Sessions

### S1 — build: Production VPC, three tinted groups, emphasized bus hub, 10 labeled edges (async dashed), color-coded families, margin sticky
- session/container: 8dcb847c-1378-4131-9702-65ef864f1161 / 195bec07-3df1-550a-8c5d-9a55511c2220
- outcome: committed · 36 turns · 22 apply_ops · **10 renders** · op mix `{addObject: 21, addConnection: 10, updateObject: 1}`
- tool sequence: board → apply_ops → render → (apply_ops×4 → render)… — genuine look-adjust loop, 10 renders vs v3-S1's 2.
- diagnostics story: the richest of the trial. **label-clearance fired as errors across 7 apply_ops rounds**
  (t8/10/12/13/15/17/31: "REST" chip covering inventory-service; async chips overlapping each other and data chips) and the
  error-tier gate forced fixes every time — commit only after 0 errors. The **new labeled-edge breathing check fired once**
  (t23: `labeled edge seed-bus↔billing-event-out: 144px gap is too tight for its "invoice.issued" chip (give it ≥168px)`) and
  was heeded. Also fired: density-orphan (t3, seed-bus 1040px from cluster — heeded by redesign), color-contrast (t3, blue
  nodes on blue Edge section — heeded, nodes went white), section-trim (t13/t18, services right padding 16px<24 — heeded),
  spacing-ladder (t13/14/18/26/28 — 16/80/112px off-ladder nags, heeded), rhythm (t14/26), registers (t5), edge-clarity
  (t12, anti-parallel inventory↔bus pair — heeded via offset routes). hub-balance W1 survived to commit and was
  **overridden** — verbatim from the commit summary: "intentionally overrode W1 hub-balance to keep the bus centered
  between Services and Data as requested."
- **rule side-effect worth flagging**: under sustained label-clearance error pressure the agent invented 9 unrequested
  relay pill nodes (t13 thinking: "Planning edge routing with intermediary ports… Designing relay nodes") — PUBLISH/CONSUME/
  DATA/CACHE/I-O pills that no instruction asked for. The gate reshaped *topology*, not just geometry.
- aesthetic: **5 / 10** (gc-decomp = 7.5). Side-by-side delta: gc-decomp gives every label chip its own pocket of air on its
  own edge; S1's corridor packs "order.created" *touching* "read/write" and "stock.changed" clipped against a CONSUME pill
  (crop `s1-crop-bus.png`) — and the diagnostics reported clean spacing at commit.

### S2 — readability iteration (the round's core probe): "give every labeled edge room to breathe, widen the corridors, rebalance to reference quality"
- session/container: 952d126b-fec4-4e9c-9eb4-3226e3457352 / 281f5edd-eaae-52e8-b5a3-be74fd127596
- outcome: committed · 14 turns · 6 apply_ops · 5 renders · op mix `{updateObject: 18}` — pure re-layout, zero collateral
- **the agent actually spread things out**: rendered FIRST (t1, before any ops), then VPC height 1248→1536, Services→Data
  corridor widened to ~656px with the bus (288×176) alone in it, every read/write chip moved to own its mid-corridor air,
  the three async chips separated into distinct rows. Committed diagnostics: **clean**.
- diagnostics story: section-trim earned its keep with the *other* blade — t2: "services-group bottom slack 288px (>160 —
  not hugging)" — heeded (this is the anti-dead-space direction the old v1 towers needed). Spacing-ladder nagged 80/112px
  off-rung across t2/4/6/8 and consumed ~3 rounds of micro-shuffling; registers t6/t9 ("y-centers within 8px — align or
  separate") heeded; rhythm t10 heeded. **Critical miss**: the t0 board call on the S1-committed state — the one with
  physically touching chips — reported only the hub-balance warning. The kissing-chips defect was invisible to every rule.
- aesthetic: **6.5 / 10**. Side-by-side delta: corridors now genuinely read (closest to gc-decomp's generosity), but
  gc-decomp binds each label to its edge unambiguously while S2 still has an async chip pocket where three dashed trunks
  converge and chip→edge binding takes tracing; the unrequested pill rail remains as a whole extra column of visual noise
  gc-decomp simply doesn't have.

### S3 — edit probe: "add a Notifications service inside Services wired to the bus (2 labeled dashed consumes); groups keep hugging; no chip crowds another; preserve everything"
- session/container: c49a0332-8cf8-4494-aa3c-a88585899d99 / 96574c61-1030-5316-83b8-2e9f0d54c9bd
- outcome: committed · 23 turns · 12 apply_ops · 5 renders · op mix `{updateObject: 13, addObject: 3, addConnection: 2}`
- containment held: Notifications Service landed inside Services, Services grew to keep hugging, nothing escaped any
  parent — the old-eval child-expulsion class stayed dead for the third session running. All 10 pre-existing edges
  preserved with labels/styles/colors intact.
- diagnostics story: label-clearance errors again drove the loop (t2–t17: "REST" chip covering inventory-service, new
  "order.created"/"invoice.issued" chips covering inventory-data-out — all fixed before commit). Committed with 3
  warnings **overridden with verbatim notes**: "shipped W1 (112px semantic cluster gap), W2 (bus stays right of its south
  fan to preserve corridors), and W3 (64/96px interface rhythm separates service clusters)." hub-balance fired third
  session in a row against the deliberate corridor-hub placement.
- defect (minor, invisible): the two addConnection targets are swapped vs their labels — "order.created" lands on
  notifications-INVOICE-consume and vice versa; both pills read "CONSUME" so nothing user-visible breaks, but it shows
  edge→port bookkeeping under pressure is fuzzy.
- aesthetic: **6 / 10**. Side-by-side delta: the addition itself is reference-grade (labeled, dashed, chips own air —
  crop `s3-crop-cache.png`), but the SE corner accrues what gc-decomp never allows: a dashed trunk running along the
  Services border and crossing the teal session-cache edge twice, and the Data group's interior voids (400px+ empty bands
  between Postgres/Redis) grew — uniform sparseness where gc-decomp does deliberate density variation.

## Rule-efficacy table

| rule | fired (times) | heeded / quickfixed / overridden | correct? | verdict |
|---|---|---|---|---|
| spacing — ladder | ~12 (S1 t13/14/18/26/28, S2 t2/4/6/8, S3 W1) | heeded manually except S3 W1 overridden | real but trivial; 80/112px nags cost ~5 turns of micro-shuffling across S2/S3 | WORKING but NOISY — batch or auto-fix |
| spacing — labeled-edge breathing (new) | 1 (S1 t23) | heeded | correct that once; **BLIND to chip-chip/chip-pill kissing** — S1 committed touching chips with clean report (s1-crop-bus.png), S2-t0 board on that state showed nothing | MISCALIBRATED — measure clearance *around the chip* (≥16–24px vs chips/nodes/edges), not just own-segment length ≥168px |
| grid | 0 | — | no false positives; placements stayed on-grid | untested (silently fine) |
| section-trim | 3 (S1 t13/t18 pad<24; S2 t2 slack 288>160) | all heeded | both blades correct (too-tight AND not-hugging); blind to *interior* voids by design | WORKING |
| registers | 3 (S1 t5, S2 t6/t9) | heeded | correct but cosmetic; "within 8px — align or separate" is borderline nag | NEUTRAL |
| hub-balance | fired in **all 3 sessions**, persisted to 3 commits | overridden 3× with verbatim notes | **false positive every time** — the bus was *instructed* into the corridor between Services and Data; rule only knows hub-over-fan | MISCALIBRATED for this genre — suppress when hub sits between sections / neighbors deliberately one-sided |
| rhythm | 4 (S1 t14/26, S2 t10, S3 W3) | 3 heeded, 1 overridden | real unevenness but among decorative pills; no visible payoff | NEUTRAL, mildly NOISY |
| density | 1 (S1 t3 orphan, 1040px) | heeded | correct on orphans; **BLIND to interior dead space** — Data group's empty towers (final.png right side) never flagged | WORKING for orphans, BLIND for voids — needs an occupancy check |
| label-clearance | error-tier, ~10 distinct errors across S1/S3 | all forced fixed by the commit gate | the workhorse of the trial — every fix visibly improved the render; but threshold is pure overlap, so 0–8px "kissing" passes; also its pressure induced the 9-pill relay scaffolding | WORKING (best rule in the set) — add a padding buffer; watch the topology side-effect |
| overlap (node-node) | 0 | — | none authored | untested |
| containment | 0 | — | containment stayed correct through build + 2 edits (verified in all renders); old child-expulsion class never reappeared | untested-but-clean (no violation ever authored to test the block) |
| edge-clarity | 1 (S1 t12 anti-parallel) | heeded | correct; but BLIND to S3's crossing accumulation (dashed trunk × teal edge ×2, trunk hugging section border) | WORKING, scope too narrow |
| color-contrast | 2 (S1 t3) | heeded | correct (blue-on-blue would have been bad) | WORKING |

Mechanics: `apply_quickfix` was called **zero times in 73 turns** despite ~15 `[quickfix]`-tagged warnings — the agent
always fixed manually (or overrode). Legacy solver tools: never touched. Exemplar injection on first board call ("Reference
board (house style): note section tinting, labeled edges… Aim for this level of finish") is plausibly why S1 got tints,
dashes, families, and sticky right in one pass. Commit gate (error-tier block) demonstrably shaped behavior in S1/S3;
warning-tier is advisory and was overridden honestly with notes every time.

## Delta vs v3 / old baselines

Old S1 build: aesthetic 2, 21 parse retries, stretched empty towers. v3 S1: 4 (unanchored), 6 turns, 2 renders. v4 S1: 5
*anchored to a 7.5 bar*, 0 retries, 10 renders, and the readability probe (S2) — a request class that didn't exist in
either old battery — moved the board from 5 → 6.5 in one session with an 18-op pure-geometry patch. The remaining gap to
gc-decomp is no longer mechanical; it is taste: label-edge binding ambiguity, unrequested scaffolding, uniform sparseness
vs deliberate density.

## Top 3 changes for Round 2

1. **Chip-clearance margin (threshold change)** — extend label-clearance / the breathing check to demand ≥16–24px clear
   air around every label chip against other chips, pills, nodes, and foreign edges. Grounding: S1 committed
   "order.created" physically touching "read/write" and "stock.changed" clipped against a CONSUME pill while diagnostics
   read clean (s1-crop-bus.png), and the S2-t0 board call on that exact state raised nothing — the precise element-level
   form of Ford's "too close together if you're actually trying to read it".
2. **Genre-aware hub-balance (threshold/suppression change)** — do not fire when the hub sits in a corridor between two
   sections or its fan is deliberately one-sided. Grounding: fired in all 3 sessions against the instructed placement,
   was overridden 3× with notes, and its one S1 "fix" attempt (t28–t29) burned turns fighting the requested layout.
3. **Anti-scaffolding guidance + interior-void diagnostic (guidance + new rule)** — prompt guidance: "label edges
   directly; never introduce relay/port nodes unless asked"; plus a density sub-check flagging sections whose content
   occupies <~40% of their area. Grounding: the 9 unrequested pills born in S1-t13 under label-clearance pressure are the
   single biggest visual divergence from gc-decomp, and the Data group's unflagged 400px voids (final.png) are the last
   remnant of the old empty-tower failure that no current rule can see.
