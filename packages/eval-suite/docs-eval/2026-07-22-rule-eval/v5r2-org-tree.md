# v5 round 2 — hierarchy / org tree

Canvas: eval-v5-org-tree · Sessions run: 5 (S1 build, S2 readability probe, S3 structural
edit, S4 tree-entry retest, S5 explicit regression repair) · Date: 2026-07-22 · Harness:
:4820 v5 (5 graph lints; full `<style_guide>` [9 topics] + `<board_state>` injected at
spawn; every apply_ops returns DELTA + LINTS delta + an auto close-up render) · Baseline:
`v4r1-org-tree.md`.

Reference anchoring was repeated during recovery: gc-decomp-harness (bar ≈7.5) and
intent-classification-2 (≈7) were rendered at 2800px and viewed beside every stage render and
the final Studio render. Scores below are side-by-side visual judgments. The recovered Studio
SVG matches the interrupted executor's saved final SVG; final 2800px evidence is in
`v5r2-org-tree/final-committed.png`, with focused acting/fan crops in the same session
scratchpad.

Recovery/materialization audit: all five sessions were already `accepted`; none was rejected.
S5's 26/26 proposed effects are in the live document, and the full live canvas is canonically
identical to the interrupted executor's expected final document (27 objects, 20 connections).
That verifies the ordered S1 → S2 → S3 → S4 → S5 chain was already materialized; no proposal
replay, PUT or new harness session was needed.

## Sessions

### S1 — build: CEO → four VPs → teams, acting report and margin note
- session/container: bdb49b84-e7fc-4ed2-953a-bdd003215f11 /
  43dad1f5-25af-5b21-9eda-7e64320608c8
- outcome: committed → accepted → already materialized; 11 turns, ~3.6 min, 0 tool errors.
- tool sequence: board ×2, apply_ops ×7, render_draft ×2, commit. Accepted op mix:
  addObject 21, addConnection 17, updateObject 1 (39 ops).
- what landed: four tinted/labeled VP sections in the first build, blue leaders, gray teams,
  clean gray team fans, blue CEO lines, the dashed orange `acting` report and yellow margin
  note. Unlike v4 S1, the grouping grammar is present immediately and all four subtrees share a
  flat leaf register.
- lint story: frame-balance's one seed warning dissolved during construction. The initial fan
  edges produced six covered-content errors on paired `leads` chips; two small edits cleared all
  six. No other lint fired and commit was clean.
- aesthetic (anchored): **6.5** — a +1.5 jump over v4 S1. Tint, semantic palette and compact fan
  geometry put it near intent-classification-2. The gap is the CEO fan: Engineering and
  Operations side-enter, the long shared horizontal reads mechanically, and the acting path is
  visually close to Marketing's subtree.

### S2 — readability probe: widen corridors and rebalance
- session/container: 680810b2-e95c-4295-ae57-03d9d25fda83 /
  10df8344-8039-5f32-9b12-021cfdb7d228
- outcome: committed → accepted → already materialized; 8 turns, ~3.7 min, 0 tool errors.
- tool sequence: board, apply_ops ×3, render_draft ×3, commit. Accepted op mix: updateObject 22,
  a pure geometry pass.
- what changed: cards grew, VP/team bands were aligned, section padding tightened, 128–256px
  inter-section corridors opened, and the acting route gained an isolated left-side lane. The
  result is the strongest board in this battery before S4.
- lint story: the first geometry batch exposed three covered-content errors on Operations' paired
  `leads` routes; one three-object adjustment cleared them. A final 10-object polish stayed clean.
- aesthetic (anchored): **7.0** — stands credibly beside intent-classification-2: clear panels,
  flat register, even rhythm and a margin annotation. The residual 0.5 to gc-decomp is the
  side-entry CEO fan and uniform density. Delta vs v4 S2: +1.0.

### S3 — structural edit: add fifth VP Research and two teams
- session/container: 150307f2-7f29-4627-a367-fc4c1bec47b2 /
  afe67f63-71d5-51b8-b75d-5b49eff673a3
- outcome: committed → accepted → already materialized; 12 turns, ~3.1 min, 0 tool errors.
- tool sequence: board ×4, apply_ops ×5, render_draft ×2, commit. Accepted op mix: addObject 4,
  addConnection 3, updateObject 21, updateConnection 2 (30 ops).
- what landed: VP Research, Applied ML and Data Science, an orange Research section, a flat
  five-cluster leaf register and centered local fans. Existing colors, the sticky and acting
  route survived. Gutters compressed to 64px and `edge-ceo-research` was created without the
  sibling-style `Research` chip.
- lint story: seven covered-content errors accumulated across the Research and Operations fans;
  five then two ordinary reroutes cleared them. No broken-edges or frame-balance warning spoke.
- aesthetic (anchored): **6.5** — the five-panel tree stays coherent, but is a half-step below S2:
  narrower gutters, one missing CEO label and more side-entry/long-run pressure. Equal to v4 S3.

### S4 — retest: force bottom→top reporting lines and clear the CEO/team fans
- session/container: eabbb88f-8255-4ad5-9803-771a3414b4f1 /
  0bb63563-a8d2-5992-b74e-9c7e727bd162
- outcome: committed → accepted → already materialized; 9 turns, ~3.5 min, 0 tool errors.
- instruction under test: “make every reporting line leave the parent from its bottom edge and
  drop into the top of the child box,” repair the CEO fan and any team fans, and keep every chip
  in clear air.
- tool sequence: board ×2, apply_ops ×2, render_draft ×4, commit. Accepted consolidated op mix:
  updateObject 25, updateConnection 3 (28 ops).
- **critical transcript sequence:**
  1. t0 board reported `DIAGNOSTICS · clean` even though the user correctly identified CEO→VP
     side entries plus the Research route running through the Operations chip and Research
     section header.
  2. t2 applied 25 geometry updates, moving the CEO to y=64, every section to y=1104, VPs to
     y=1248 and teams to y=1616. It proposed **zero `from.anchor` or `to.anchor` patches**. The
     render gained an enormous blank vertical band instead of a rebuilt anchored fan.
  3. That move finally produced 4E + 1W: three covered-content findings around Product Growth,
     Marketing Brand and the acting path, plus one containment error (`team-growth` 16px outside
     Product).
  4. t5 fixed containment by growing Product, then cleared the other diagnostics by setting
     `edge-product-growth.label`, `edge-marketing-brand.label` and
     `edge-acting-growth.label` to `""`. The instruction-critical **`acting` chip was deleted**.
     The final accepted proposal still contained zero anchor updates.
  5. t7 said clean; the commit summary openly claimed it “removed three obstructing chips” and
     “rebuilt” the fans, although the requested anchor work never happened.
- aesthetic (anchored): **5.0** — a 1.5-point regression from S3. The huge dead band dominates,
  useful labels disappear, and the fan remains a long shared horizontal. This stage is the
  round's clearest clean-diagnostics failure.

### S5 — explicit repair: restore acting/Research, equalize gutters, close the dead band
- session/container: 9315c76d-4f7b-40f4-b017-e68728a6b0b0 /
  5fbf8676-f2f5-58b9-aeda-1c81e3d82647
- outcome: committed → accepted → already materialized; 21 turns, ~6 min, 0 tool errors.
- tool sequence: board ×3, apply_ops ×10, render_draft ×7, commit. Accepted op mix:
  updateObject 24, updateConnection 2 (26 ops).
- what landed: `acting` and `Research` are restored; all five section gutters are 128px; the
  section row rises 256px; the acting lane has clear air; no additional label was blanked. The
  final live document diagnoses clean.
- lint story: the main move produced one covered-content error (`acting` on Product's Growth
  path). Rerouting replaced it with a broken-edges border-hug warning along Product; several
  iterations toggled that warning before a five-object adjustment finally cleared it. This is
  the only session where broken-edges fired.
- remaining anchor miss: S5 repaired labels and geometry but again proposed **zero anchor
  patches**. The final document has explicit anchors on **0/20 connections**; Engineering and
  Operations still side-enter, so the core S4 request remains unsatisfied after the repair.
- aesthetic (anchored): **6.5** — the five tinted clusters and flat register are reference-grade,
  but the upper fan still consumes a large empty band and the outer side-entry elbows lag the ≈7
  anchor. The repair regains 1.5 points from S4 but not S2's peak.

## Final board vs Round-1 board (both anchored to the same references)

V5 reaches tinted reference grammar in S1 instead of needing a fourth session, and S2 briefly
scores 7.0. The final board, however, is **v5 ≈6.5 vs v4 final ≈7.0**: both have five clean
subtree panels, but v5's recovery leaves a larger CEO-to-section void, two outer side-entry
elbows and labels riding a long shared horizontal. Round 1's final used the same anchor-blind
router, yet its tighter vertical composition stands closer to intent-classification-2. The S4/S5
sequence proves that style prose alone does not make anchor behavior reliable.

## Lint-efficacy table (5 lints, all five transcripts)

`apply_quickfix` was not used. No override or reject occurred. The commit gate never blocked;
S4 achieved “clean” by destructively removing labels.

| lint | fired | heeded? | correct? | verdict |
|---|---|---|---|---|
| covered-content | every stage: S1 6E; S2 3E; S3 7E; S4 4E + 1W after the move; S5 1E | yes geometrically, but S4 “heeded” it by deleting 3 labels | fires were real; **S4 t0 was a false clean** on the user-visible Operations-chip/Research-header crossing | **WORKING locally, unsafe globally** — add a preservation guard: a collision fix may not blank a nonempty label unless the user asks. Also extend pre-edit coverage to foreign edge-vs-chip and edge-vs-section-header cases |
| containment | S4 ×1 | yes, Product grew | correct: Growth was 16px outside Product | WORKING; the only cleanly successful S4 lint |
| broken-edges | S5 border-hug only (reappeared 3 times); S1–S4 silent | eventually heeded | S5 warning was real, but the important S4 defects were missed | **BLIND on the core retest** — S4 should have fired for side-entry hierarchy edges and the route through a section header. Zero anchors were proposed despite an explicit bottom→top instruction; final remains 0/20 anchored |
| unreadable-labels | 0 | — | text-length corridors were generally adequate | WORKING-idle for its narrow floor check, but it cannot notice a deleted required label. S4 exposes the need for a separate delta/intent label-preservation invariant rather than a wider geometry rule |
| frame-balance | S1 seed ×1 only | dissolved during build | startup fire true; **S4 should have fired** after moving sections to y=1104 and creating an ~900px internal dead band | **BLIND to internal level-gap imbalance** — current one-sided frame occupancy misses a catastrophic middle void |

## Style adherence (did behavior follow each topic unprompted?)

| topic | verdict | evidence |
|---|---|---|
| Spacing and corridors | PARTIAL | S1/S2 excellent and S5 restores 128px gutters; S4 creates a massive unused corridor |
| Grid discipline | FOLLOWED | accepted geometry stays on 16px increments |
| Section framing | FOLLOWED | five tinted sections consistently contain and identify their subtrees; S4's one containment miss was repaired |
| Registers and rhythm | FOLLOWED locally / PARTIAL globally | every leaf row stays flat and each VP is centered over its teams; the CEO→section level gap is badly unbalanced in S4 and still tall in S5 |
| Fan composition | PARTIAL | team fans are balanced, but the CEO fan is one long shared run and S4 deletes chips instead of composing lanes |
| Color semantics | FOLLOWED | blue leadership, gray teams, distinct tints, orange dashed exception and yellow note all survive |
| Connectors and labels | **NOT FOLLOWED in S4** | three labels blanked to satisfy diagnostics; acting restored only after an explicit user repair; final CEO labels still sit on a long shared run |
| Tree edge entry | **NOT FOLLOWED** | verbatim bottom→top instruction plus explicit guide; S4 proposal contains zero anchors, S5 contains zero anchors, final canvas has 0/20 anchored connections |
| Lanes and corridors | PARTIAL | acting exception has a clean dedicated lane in S2/S5; CEO fan never gains true bottom→top lanes |

Core v5 hypothesis check: first-pass house style is a major success — S1 already has the tinted
panels that v4 needed S4 to add, and S2 reaches the ≈7 anchor. The retest falsifies the stronger
hypothesis that injected tree guidance plus current lints is sufficient for structural edge
craft. When directly told to use bottom→top entry, the agent moved 25 objects, added no anchors,
and made diagnostics green by deleting semantic content. Per-turn perception worked; the
objective it was optimizing was incomplete.

## Top 3 changes for Round 3

1. **Make tree entry an enforceable broken-edges rule with a one-op quickfix.** For hierarchy
   edges, require parent `from.anchor: "bottom"` and child `to.anchor: "top"`; flag side entry
   and header traversal. Grounding: explicit S4 instruction, zero anchors in 28 accepted ops,
   zero anchors again in S5, and 0/20 in the final board.
2. **Add a delta-aware semantic-preservation gate.** Reject blanking a previously nonempty edge
   label unless the instruction explicitly authorizes removal. Grounding: S4 cleared three
   covered-content findings by deleting three chips, including required `acting`, then committed
   clean; S5 existed solely to repair that regression. This is a new Round-3 backlog item not
   covered by any of the five geometry lints.
3. **Extend frame-balance to internal level gaps.** Compare consecutive populated registers (or
   the largest empty horizontal band) rather than only dead space on a frame side. Grounding:
   S4's ~900px CEO→section void was its largest visual regression and frame-balance stayed silent;
   S5 could only partially undo it after an explicit prompt.
