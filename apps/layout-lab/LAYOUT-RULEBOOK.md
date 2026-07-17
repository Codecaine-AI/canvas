# LAYOUT-RULEBOOK — corpus-derived layout rules for the sketch compiler

Rules mined from the eight polished boards in `canvases/` (agent-flows-2,
bubba-voice, claude-code-researcher, gc-decomp-harness, ink-diagrams,
intent-classification-1/-2, v2-flow). Each rule is written as an enforceable
compiler constraint — the fitter detects it, the DSL declares it, the
expander must reproduce it. Corpus evidence is cited inline.

The implementation lives in `src/sketch/` (fit.ts detects, serialize.ts
spells, expand.ts enforces). Constants referenced below are the ones the
expander ships with.

## R1 — The 16px grid

Every emitted coordinate, extent, corridor width, and pitch snaps to a 16px
grid. Sub-16 offsets in the corpus are authoring noise, never intent
(v2-flow's `sticky-overall-context` at x=810.4 reads as 816).

Enforcement: `GRID = 16`; split allocation runs on 16px units
(`allocateWeightedUnits`); hug rects snap up to 16; fan pitch snaps up to 16.

## R2 — The spacing ladder

Sibling gaps come from the closed ladder `{0, 32, 64, 96}`; separation
between unrelated clusters is at least 128.

- 0 ("flush"): repeated template cells — ink-diagrams' twelve 288x80 table
  cells tile with zero gap on both axes.
- 32 ("packed"): stacked chips/pills — gc's config pills sit at pitch 96 =
  64 height + 32 gap; v2's memory predefined-process stack (raw gap 59)
  reads as packed, not spaced.
- 64 ("spaced"): default sibling gap inside a leaf (`ITEM_GAP = 64`); gc's
  db row (pitch 352 = 288 + 64), gc's PR stack (pitch 144 = 80 + 64).
- 96 ("loose"): chain steps with room for connector labels — agent-flows-2's
  function-call chain (pitch ~176 = 80 + 96).
- ≥128 ("cluster"): the root-level corridor between unrelated groups
  (`GUTTER_LADDER = [128, 96, 64, 32]` by split depth).

Gap classification is semantic, not nearest-rung: raw < 16 → 0, < 64 → 32,
< 96 → 64, ≤ 112 → 96. A sub-64 gap is *adjacent* in the corpus and must
stay adjacent after the round trip.

## R3 — Section chrome

Sections reserve a 64px header band (label chip + breathing room) and pad
content 48px on the sides and bottom (`SECTION_HEADER = 64`,
`DEFAULT_PADDING = 48`). Evidence: gc `section-config` (top inset 64, side
48), ink `section-input-adapter` (side 48), intent-2 `section-direct`
(side 64). Corpus top insets run 64–128 depending on label size; the
compiler uses header 64 + padding 48 where the region affords it and
degrades proportionally in cramped regions (12%/16% caps).

## R4 — `grid`: repeated-cell tables

**Detect:** ≥ 4 same-size items (± 2px) occupying a complete row/column
lattice with uniform pitch (± 8px registers) — or ≥ 3 for a single row or
column. **Spell:** `grid RxC flush|g32|g64|g96: cells…` (row-major).
**Expand:** exact lattice — one shared cell extent, one gap from the ladder,
column/row identity preserved.

Template members are pixel-identical: every cell in ink's 3x4 table is
exactly 288x80; gc's five config pills are exactly 288x64. The expander
gives all cells one extent and one scale so registers survive exactly. Grid
cells are immovable afterwards — no tier shift, no fan pitch, no overlap
push may move a lattice cell (the lattice anchors those constraints
instead).

Evidence: ink-diagrams 3x4 flush (the single largest fidelity loss in DSL
v1 — 25% of its adjacency); gc 5x1 g32 pills, 1x3 g64 db row, 3x1 g64 PR
stack; v2 4x1 memory stack; researcher/intent-1/agent-flows 3-4x1 process
chains.

## R5 — `tier`: cross-branch registers

**Detect:** ≥ 3 non-section nodes from ≥ 2 different leaf groups whose
cross-axis centers sit within ± 8px of one register (± 4px is the corpus
norm; 8 tolerates authoring noise). Both axes: a `y` tier is a horizontal
row register, an `x` tier a column register. **Spell:**
`tier <name> y|x: members…` after the tree. **Expand:** solve as
constraints after the split pass — members shift onto the shared register
(the members' median center; a grid member's lattice register wins when
present).

Order rules the solver must keep:

- Same-axis tiers are declared in ascending register order and may never
  leapfrog each other on expansion.
- A member crossing a leaf-sibling on the way to its register carries that
  sibling along (leaf-internal order is inviolable).
- Members pinned by a tier on an axis are excluded from fan pitching and
  carry-along on that axis.

Evidence: gc's hero row at y-center 392 (runner CLI, scheduler, worker
pool, compile+validate, exact-match decision — spanning section-hero's
subtrees); gc's y=604 register (pi-provider pill, toolpack, checkpoint —
three different columns); intent-2's three global action tiers (y-centers
1256 / 1480 / 1672 spanning both halves of the layered section);
researcher's doc row (y=880 across Agent State and Sub Agents sections).
Tier pitch along the register runs 192–320 between chip-sized members.

## R6 — `fan`: hub over children

**Detect:** a node whose outgoing edges include ≥ 2 targets sharing a
register (± 16px) strictly on one side (S/N/E/W), hub main-center within
max(64, 25% of span) of the children's midpoint. **Spell:**
`fan hub > (children…) S`. **Expand, bottom-up (nested fans first):**

- Children share one register on the fan side; a moved child carries its
  whole fan subtree rigidly.
- Hubs bottom-anchor onto children top-anchors: the children's register
  always clears the hub by ≥ 64px — never overlap (intent-2: layer-1
  pentagon bottoms 1312 → action tops 1424).
- Even pitch. When hub and children share one section (a local template),
  pitch normalizes to the widest solved child subtree + 64, so nested fan
  trees compose compactly (intent-2's layer tree derives its 640 pitch from
  its grandchildren). When children straddle section boundaries, never
  compress the existing spread past unrelated content — only widen.
- The hub centers over the children's midpoint (intent-2:
  classify-intent-layered at x=3168 = midpoint of layer-1 centers
  2208..4128, exact).

Evidence: intent-2's three-level layer tree (9 fans, nesting 3 deep);
intent-1's decision fans; v2-flow's chevron fan; researcher's spawn fan.

## R7 — `lane`: margin rails that never stretch

**Detect:** a split side whose content is thin along the split axis
(≤ 35% of the parent and ≤ 640px absolute) and fills < 62% of the band's
cross extent. **Spell:** a `@corner` attribute on the split weight
(`row 1@NW|6`). **Expand:** allocate the weighted band, but lay the child
at its intrinsic (content) extent, snapped up to 16px, registered at the
declared corner — never stretched across the band.

Corpus margin lanes are 368–608 wide (gc sticky rail 368; v2
sticky-overall-context 497; bubba side stickies 560–608) and corner-register
(gc rail and config panel NW; v2 rails W; note chips SE). DSL v1 stretched
gc's config panel from 560 to 1720 tall — 52% of that board's relation
loss; lanes exist to make that impossible.

Intrinsic extent is computed recursively (leaf spine/band block + 16px
leaf padding; grid lattice; section = child + R3 chrome; split = children +
32px gutters), capped by the band.

## R8 — Size semantics

Three size classes, ranked per leaf by area percentile:

- `S` — chips: compact operands, icons, action triangles (intent-2's
  128x112 actions, gc's 160x64 curator).
- `M` — template: the workhorse process/pill/card size; template members
  of one lattice are always the same class.
- `L` — terminal/emphasis: end states and decision hubs (ink's 192x192
  completion ellipses, gc's 256x112 exact-match decision, intent-2's
  256x144 classify pentagons).

Type extents come from the canvas drop defaults scaled 0.72 / 1 / 1.35,
with corpus overrides where the drop default misrepresents the corpus:
stickies expand as 384x288 base (corpus stickies run 336–608 x 112–688,
median ≈ 400x320; the 176x128 drop default collapses every relation
through a sticky rail).

## R9 — Feedback edges and detours

Forward flow routes through reserved corridors (split gutters are emitted
as routable corridors). Feedback edges exit the side that faces their
return corridor and detour around content on offsets drawn from
`{48, 80, 96, 128, 144, 192}` (ink's "calls are incorrect" loop exits W and
returns at a 144 offset; gc's regression loop returns through the 128
cluster corridor). The elbow router prefers the facing sides of the two
boxes but may exit any free side (a flush grid cell's facing side is often
walled in); crossing a box is forbidden, entering its 6px halo is merely
penalized. Boxes physically overlapping an endpoint are unavoidable by
definition and carry no routing signal.

## R10 — What the DSL deliberately does not say

Absolute registers are never spelled. A consequence the corpus makes
measurable: cross-column interleaving finer than the ladder (gc's hero row
at y=392 threading *between* pill rows at 96 pitch across a corridor — the
above/below facts flip on 16–48px differences) is not representable and is
the dominant residual loss on gc-decomp-harness. If a future op is added
for it, it should be a register *offset* on `tier` (e.g. `tier hero y@+128
of config`), not raw coordinates.

## Decision accounting

The metrics panel counts spatial decisions on both sides:

- DSL: split weights + lane hugs, one compass slot + one size class per
  leaf item, grid dims + gap + one size class per cell, one axis/direction
  per tier/fan + one per referenced member.
- Raw: 4 per object geometry, 2 per connector waypoint, 1 per explicit
  endpoint anchor.

Corpus, DSL v2: 76–177 DSL decisions vs 166–324 raw (mean ratio ≈ 0.46),
at 92.9% mean relation and 98.8% mean adjacency preservation.
