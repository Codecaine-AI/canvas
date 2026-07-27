# Eval review — Ford interview, 2026-07-24

Run under review: `2026-07-23-eval-192637` (fixture tier, means SQ 5.79 · IC 6.43 · IF 6.57 · ES 8.21 · PH 2.86).
Method: cross-cutting interview over all boards, cross-referenced against judge evidence
and the SUT code (`packages/canvas-agent`). Findings are organized symptom → confirmed
cause → surface. Decisions recorded inline are Ford's.

Grading caveat for future diffs: the run's PNGs carry the font-fallback fake-italics
artifact (fixed for future runs). The two worst IC hedges — s6 "unreadable top executive
box", s4 "lane name not confidently readable" — are judges failing to read text in the
render, so IC on s4/s6 should recover partly for free on re-render. Don't credit that
recovery to agent fixes.

---

## F1 — Cramped clusters, wire pileups, no room to breathe

**Symptom (Ford):** everything too close together, arrows on top of each other; sections
too cramped; diagrams have no visual flow.

**Judge corroboration:** every scenario's SQ sheet flags cramped corridors and edge
pileups — edge_legibility scored 4–4.5 *Failure* on s1/s5/s7 ("closely parallel runs",
"labels sit tightly on bends", "crowded bends", perimeter-scale detour routes). Nuance:
several sheets simultaneously flag "enormous unused outer frame" / "stretched
composition" — so the failure is distribution, not board size: nodes packed
shoulder-to-shoulder in clusters while the frame has dead space. With no corridor
between nodes, the auto-router shoves long edges around the board perimeter — the detour
complaints are downstream of the gap sizes.

**Confirmed cause:** the prompt contains zero spacing guidance for builds (the only
spacing sentence is edit-mode "adopt the board's spacing rhythm"), and none of the four
lints (covered-content, containment, broken-edges, unreadable-labels) checks crowding.
Nothing in the system ever pushes back on a packed layout.

**Decision:**
- **Arrow-corridor rule** in the prompt: gaps sized so routed wires *and their labels*
  fit between nodes without hugging them — starting numbers: node-to-node gap ≥ one
  node-height vertically, ≥ half a node-width horizontally.
- **New crowding/clearance lint (W\*)** so the agent gets diagnostic pushback when it
  packs nodes. Matches the existing diagnostic-layout design.
- Composition guidance for overall visual flow (a diagram should read in a direction).

**Surfaces:** `agent/catalog/layout-editor/prompt.json` (PLAN/BUILD steps),
`board/lints/rules/` (new rule).

## F2 — Object monoculture: all gray rectangles, no stickies

**Symptom (Ford):** barely uses the object vocabulary, defaults to one rectangle type;
never uses stickies for summaries/notes.

**Judge corroboration:** s7 IF 8→6 — "On-call operator" drawn as `rectangle`/
`rounded-rect`, no actor shape.

**Confirmed cause:** the vocabulary the agent sees is rich (13 flowchart + 16 geometric
types, icons, stickies) but is *text-only* — the agent has never seen any of them
rendered. Sticky guidance amounts to "it exists"; there is no when-to-use framing
anywhere.

**Decision:** **vocabulary contact-sheet at boot** — render every object type with its
label as one sheet image, generated from a canonical place off the live roster (so it
can never drift, same philosophy as `vocabulary.generated.ts`), assembled into boot
context via the existing kernel boot-image path (`service/session/boot.ts`,
`BootImages`). Sticky when-to-use lives in the restructured capabilities block (F3).

**Surfaces:** boot image assembly, a canonical contact-sheet renderer, capabilities
prose.

## F3 — Capabilities block restructure

**Symptom (Ford):** the vocabulary/semantics split doesn't teach the agent what the
board can actually *do*; `annotation-marker` "is not a thing".

**Confirmed ground truth:** `annotation-marker` is a first-class canvas type
(`canvas/src/state/schema/object-types.ts:10`, D16-era) with its own renderer
(`objects/shapes/misc/annotation-marker.tsx`), defaults, and test fixtures; it is
auto-generated into the agent vocabulary and hand-blessed in `capabilities/semantics.ts`
plus a board_model paragraph.

**Decision:**
- Restructure the capabilities block into **four flat kind-sections — sections,
  stickies, objects (shapes + icons), connections** — each written as *what it is →
  what it can do (functionality) → notes on how to best utilize it*, replacing the
  generated-vocabulary/semantics split as the organizing structure. (The type roster
  stays generated so it can't drift; it nests under the objects section.)
- **Delete `annotation-marker` from the canvas schema entirely** — renderer, defaults,
  tests, fixtures, agent surface. Annotations are user-only comments on objects; there
  is no marker object.

**Surfaces:** `capabilities/` (semantics.ts, generator, ops.ts prose), prompt
board_model, `packages/canvas` schema + renderer + tests.

## F4 — Connections: weird anchor choices, section-attach never used

**Symptom (Ford):** arrows route weirdly, pick strange connection points; can't seem to
route arrows to a section.

**Confirmed ground truth:** section endpoints are *already valid* — endpoint validation
(`service/session/op-surface.ts:134`) only checks the id exists, any object kind
including sections. But no prose anywhere says so, so the agent never tries it. Whether
routing behaves well against a section frame is untested.

**Decision:** the connections kind-section (F3) teaches the actual functionality —
endpoints attach to objects *including sections*, anchors/connection points, elbows/
waypoints, auto-routing — plus the working process: **connect object-to-object first →
look at the routed result (ROUTES block) → judge whether the connection point reads
well → adjust anchors/waypoints to make it look better.** The ROUTES block already
reports the true routed polyline; the prompt never frames it as a judgment loop.

**Surfaces:** capabilities connections section, prompt workflow; verify section-endpoint
routing actually works and add coverage.

## F5 — The PH story: boot-only perception with a prompt that lies about it

**Symptom:** PH ≈ 3 all run; s7 PH 2 with 169 rejected calls, ~153 of them a
brute-force search for a connection ID (e3).

**What actually happened in s7 e3** (instruction: give the replay loop its own
corridor): the real connection was `feedback-replay` (cold-archive → ingest-gateway,
label "replay") — named for its *role*. The agent guessed structurally from endpoint
names — `cold-replay-ingest`, `replay-ingest-gateway`, `cold-archive-ingest-gateway`,
100+ permutations — and never landed on it. Its thinking shows it knew a digest existed
and was hunting for it: turn 7 = "Testing empty patch trigger on board digest" — firing
no-op patches hoping the harness would re-send state. The final commit claimed a reroute
the diff doesn't contain.

**Confirmed cause (code-verified):**
1. The BOARD digest (with the EDGES id list) exists **only in the spawn-time
   `board_state` block**. No apply_ops result ever carries it —
   `apply-ops.ts` assembles APPLIED / DELTA / BOARD DIFF / LINTS / ROUTES / REQUESTS
   only. Zero `EDGES` blocks appear in any s7 session transcript.
2. **The prompt misdescribes this**: state_grammar says "Every apply_ops result carries
   these text blocks" with BOARD digest in the list. The board-state fallback
   (`agent/loaders/board-state.ts:13`) repeats the claim ("every apply_ops result
   carries the current state"). The agent behaved rationally given a prompt promise the
   harness never delivers.
3. There is no recall affordance at all — a look-only call returns no state, and
   mid-session there is no way to re-read object/connection ids.

**Fix direction:** deliver on the prompt's existing promise — push the digest (or at
minimum on look-only calls / on request), and correct the fallback text. This is the
single highest-leverage PH fix and plausibly lifts every other axis (less context burned
on fighting = more on layout).

**Surfaces:** `service/session/apply-ops.ts` (result assembly), `board-state.ts`
fallback text, prompt state_grammar (make it true either way).

## F6 — Secondary PH mechanics

- **Schema fights at session start**: invented op shapes (`addSection` payload guessed
  wrong twice, invented `addNode`) — s7 stage0 and e1 both repeated the *same* wrong
  `addSection` form. The F3 restructure (ops documented as functionality per kind)
  targets this.
- **NaN geometry from partial patches**: twice in s7 an accepted partial geometry patch
  produced `NaN×NaN` (e2 turn 16, e3 turn 32 — the latter exploded to `LINTS +60`),
  forcing multi-turn repair. Validation gap: a geometry patch should be rejected (or
  completed from existing fields) rather than merged into non-finite dimensions.
  Surface: op validation in `op-surface.ts` / patch merge.
- **Commit-summary honesty**: s7 stage0/e1 described committed errors as "warnings";
  e3 claimed a reroute absent from the diff. Partly downstream of F5 (the agent can't
  re-verify state); keep an eye on it after the perception fix.

---

## Fix plan (proposed priority)

| # | Fix | Axis target | Surfaces |
|---|---|---|---|
| P1 | Perception truth: push digest after apply (or on look), fix fallback + state_grammar text, reject NaN-producing geometry patches | PH (and everything downstream) | apply-ops.ts, board-state.ts, prompt, op-surface.ts |
| P2 | Capabilities restructure: four kind-sections, functionality-first; delete annotation-marker from canvas schema; document section-endpoints, anchors, elbows; connect→judge→adjust loop | PH, IF | capabilities/, prompt, packages/canvas |
| P3 | Spacing: arrow-corridor rule + composition/flow guidance in prompt; new crowding lint | SQ | prompt.json, board/lints |
| P4 | Vocabulary contact-sheet boot image from canonical renderer | IF, SQ | boot.ts, new renderer |

Acceptance: `make eval` scorecard diff against `2026-07-23-eval-192637`. Expect s4/s6 IC
to recover partially from the font fix alone (see caveat above).
