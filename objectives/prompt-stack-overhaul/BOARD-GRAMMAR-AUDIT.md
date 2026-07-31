# Board-grammar audit — prompt stack ① / ② / ③

**STATUS 2026-07-29: EXECUTED.** The §4 proposal is built (suite 613/0):
① rewritten to purpose + state skeleton + workflow (system.md 221 lines,
hash pk1-7f1bc2eb…), ② gained `<state_grammar>` (context/state-grammar/ +
loader + parity pins in context-loaders.test.ts), ③ stripped to bare values
(digest legends, flat-BOARD legend, requests legend, tail explainer removed),
workflow APPLIED summaries snake_cased, finalize uses `diagnosticLines`,
prompt-assembly.test.ts pins the new shape. Remaining: a traced confirmation
run (step 5 of the order of work).

2026-07-28. Analysis only at time of writing; execution followed on review. Scope: how the board
grammar is taught, where, and where each fact should live. Out of scope: the
`<diff>` block redesign (parked) and the multi-tool-call cap investigation.

Evidence base:

- ① `packages/canvas-agent/src/catalog/layout-editor/prompt/prompt.json`
  (via derived `system.md`, spot-checked in sync); `test/prompt-assembly.test.ts`
  green at audit time (23 tests, 405 expects).
- ② `src/catalog/layout-editor/context/` (capabilities, style-guide, boot-image
  declarations), read in full.
- ③ + runtime: source map of every grammar-emitting site, plus verbatim
  artifacts from the newest traced run — trace.db run
  `8633b858-df2e-482c-a52d-f532cff937ef`
  (`eval.2026-07-28-eval-184200.rag-ingestion-retrieval`, 77 turns,
  143 tool calls), turn-25 request snapshot
  (state blob `b1-2747d41d…`, context blob `b1-f7b2b365…`) and several
  tool-result blobs. Trace lags disk by boot time; the run booted from the same
  uncommitted tree this audit reads, and the artifacts match the renderers.

---

## 1. Inventory — every place board grammar is taught

### 1a. Section ① system prompt (361 lines)

| Where | Lines | Grammar content |
|---|---|---|
| `purpose` | 9 | none (instruction/requests channel, draft framing) |
| `board_model` | 50 | taxonomy, containment invariant, 20-grid snap-and-report, description contract, diagnostics roster + commit gate, report-only warning notes |
| `state_structure` opener | ~9 | re-derived-per-request contract, naming of the eight `<state>` children |
| ten `<state_block>` subsections | ~93 | line grammar for APPLIED, BOARD digest, DELTA, BOARD DIFF, LINTS, ROUTES, MEASURES, REQUESTS, VIEWS, NO-OP/ERROR |
| `state_structure` closing bullets | ~18 | result-sizing principle, `{{toolCallCap}}` cadence, `look` contract (framing knob, composition, delivery, degradation) |
| `workflow` | 176 | behavioral; grammar touchpoints: "read MEASURES rows", capabilities-roster pointers, E*/W* gate restated |

`state_structure` is ~120 of the 361 lines; ~93 of those are the ten
state_blocks — the concentration of grammar-teaching the principle says
shouldn't be there.

### 1b. Section ② context (`<capabilities>` 22.5k chars + `<style_guide>`, 2 boot images)

| Piece | Source | Grammar content |
|---|---|---|
| capabilities header ¶1 | `capabilities/index.ts:66` | four kinds + gesture framing; "a gesture applies, or it is refused" |
| capabilities header ¶2 | `index.ts:67` | **the full 20-grid rule again** (snap, read-back, exempt fractions) |
| kind blocks ×4 | `kinds/*.ts` | kind semantics; teaches digest indent rule (`sections.ts:24`), ROUTES/`through` reading (`connections.ts:32,50`) |
| generated rosters | `vocabulary.generated.ts` | closed type/color rosters (glyphs folded as types), connection field enums with defaults |
| `<gestures>` block | `ops.ts` | consequences per tool; edges blurb + `shift_segment` teach the sN-index freshness rule |
| `<style_guide>` | `style-guide/` | craft only; "digest reports every peer's exact geometry", 20px grid mention in aesthetic prose |
| boot images | exemplar + contact sheet | visual vocabulary; captioned by ②'s trailing `images attached:` line |

Parity guards: gesture roster ↔ `OP_REFERENCE` throws both ways at import;
rosters generated from the validator's schema tables. ② cannot silently drift
from the tool surface. Note `look`, `finalize`, and the annotation/request
tools are **not** in `<gestures>` (roster = operations only); `look` is taught
only in ① plus its own tool description.

### 1c. Section ③ artifacts — what self-describes at runtime (verified from turn 25)

- `<state v= turn= board=>` root; children carry counting attrs the SP never
  mentions: `<board fresh= objects= edges=>`, `<recent_ops total= showing=>`,
  `<lints errors= warnings=>`, `<requests open=>`,
  `<views attached= prior_changes=>`, `<recent_conversation showing= total=>`.
  Empty children self-close (`<description />`, `<lints errors="0" warnings="0" />`).
- `<objects>` legend (`board/digest.ts:38-42`):
  `# indent = containment · id type "text" [color] x,y w×h [k=v…] · elided defaults: color gray (sticky yellow) · shape per type`
- `<edges>` legend (`digest.ts:44-45`):
  `# id from→to "label" + extras · elided defaults: solid gray arrow=forward · route after ·: ─(sN h y=…)→ horizontal · (sN v x=…) vertical · sN = shift_segment index`
  — i.e. the artifact already teaches the full route notation.
- `<requests>` body legend when populated (`snapshots/user-requests.ts:108-110`):
  `annotation threads on this board — answer a user thread by editing board content, then dispose it with resolve_request  # Rn open target author — "body" | ↳ author — "reply" | Rn done|declined "note"`
- `<recent_conversation>` body: `older messages are cut — the state block above
  is the current picture, and <recent_ops> is the durable history` (`state/render/tail.ts`).
- `<views>` lines are self-captioning: `(1) the board as it stands now`,
  `(2) after move_label …`; a separate `attached renders: …` caption message
  numbers the images.
- `<diff>` body carries its own `BOARD DIFF · base → draft · N ops` headline.
- Degradation notes are inline where they happen (`state/render/board.ts:38-40`
  stale-snapshot note, `views.ts:44-52` render-failure notes,
  `lints.ts:25` spawn-count note).
- **No legend**: `<recent_ops>` lines (`t14 update_text e-normalize-hash`) and
  DELTA lines describe themselves by shape only.

### 1d. Tool results (verified verbatim, turn-25-adjacent blobs)

- Operation results: `APPLIED · <gesture> <target> <geometry>` → `DELTA` lines →
  `LINTS · +N −M` (findings in prose, `− E1 covered-content  (resolved)`) →
  `ROUTES` for touched wires. Formats match the SP's examples exactly.
- `look` result order (`perception/perception.ts:838-851`): `LOOK · N render(s)
  · close-up id` → flat `BOARD` digest with **one combined legend line** →
  `EDGES` → `BOARD DIFF` → `DIAGNOSTICS · clean|N errors · M warnings` →
  `ROUTES` (all edges) → `REQUESTS` → `MEASURES` per framed region → notes.
  The docblock (`perception.ts:803-815`) declares the duplication with ③
  deliberate.
- Workflow results: `APPLIED · addAnnotation <id>`, `APPLIED · updateTitle`,
  `APPLIED · updateDescription` — **camelCase summaries**, not the gesture
  names. `finalize` returns prose (`Committed: … The proposal is now awaiting
  operator review.`).
- Error/refusal templates re-teach grammar at point of use: `shift_segment`
  reprints the live route; `look`'s refusal teaches its own call shape and
  that a whole-board look is never needed; lint suggestions name the fixing
  gesture and use MEASURES' `a↔b` corridor notation.

### 1e. Single-source chokepoints (for the rewrite's confidence)

All object/edge line grammar: `board/digest.ts` (3 legend constants, 2 line
builders). All sN notation: `board/edge-route.ts:124-157`, consumed identically
by digest, ROUTES, edge ops, no-op route lines. All lint line grammar:
`board/lints/run.ts:46-49` — except `finalize.ts:69-70`, which re-implements
the line inline (second copy; code follow-up). All request/thread grammar:
`snapshots/user-requests.ts:82-130`.

---

## 2. Line-by-line: ① `state_structure` vs what actually renders

Verified accurate (preserve the facts, wherever they end up): the
re-derived-per-request contract; recent_ops newest-last; the APPLIED headline
example format; post-snap numbers in results; report-only notes; DELTA line
forms; `BOARD DIFF · base → draft` equals what committing ships;
`LINTS · +new −resolved` / `· clean` / `(N open)` forms; the ROUTES path
grammar (matches `formatNumberedSegments` output character-for-character);
MEASURES rows and their arrival with every framed region (confirmed in
`lookPerception`; an earlier truncated trace pull made this look absent — it
isn't); VIEWS ordering/captions/degradation; NO-OP/ERROR split; empty children
self-close; `look` composition list; whitespace-collapse-never-truncate.

Discrepancies and staleness:

| # | Finding | Detail |
|---|---|---|
| S1 | **`icon` is a fossil extra** | SP BOARD digest: "set fields like locked, dir, icon, and layout". Digest emits `locked= shape= layout= dir= author=` (`digest.ts:81-97`); glyphs are folded into the type name by design (`digest.ts:99-102` — "the name IS the drawing", same fact ② teaches). `icon` never renders; `shape=` and `author=` do. |
| S2 | **`lp=` missing from edge extras** | SP lists "(style, color, arrow, role, anchors, pos, wp)"; the run used `lp=0.75@40` on two edges by turn 25. The label-position extra is the one the SP forgot. |
| S3 | **REQUESTS grammar omits the author slot** | SP: `Rn open target — "body"`. Reality: `R1 open  object:x  human — "body"` plus `↳ author — "reply"` reply lines — and the artifact carries its own `#` legend saying exactly this. The SP's copy is both duplicate and wrong. |
| S4 | **`DIAGNOSTICS` header unnamed anywhere in ①** | `look` and spawn snapshots emit `DIAGNOSTICS · N errors · M warnings`; the SP teaches only the `LINTS` delta form. The model meets a header it was never told about. |
| S5 | **The flat digest form unnamed** | `look`'s `BOARD` block merges both legends into one `#` line and splits `EDGES` out as a sibling header — a second digest shape the SP doesn't distinguish from the `<board>` child. |
| S6 | **Workflow APPLIED summaries break the "verb is the gesture" claim** | `APPLIED · addAnnotation`, `· updateTitle`, `· updateDescription` are camelCase internals, not tool names (`add_annotation`, `set_board_title`, `update_description`). Code fix (snake_case gesture summaries), not a prompt fix — the SP sentence is the right contract. |
| S7 | **Attrs are richer than ① admits** | The SP names no attributes at all — not `fresh=`, not `showing=`/`total=`, not `open=`. Consistent with self-description, but currently an accident of omission rather than a stated policy; the rewrite should make it deliberate (and stop re-teaching what attrs already say, e.g. lint counts). |
| S8 | **DELTA's workflow forms unlisted** | `DELTA · thread <id> opened on <target>`, `· title none|"old" → "new"`, `· description none|N → M chars` exist beside the seven listed line forms. Minor; argues for less enumeration in ①, not more. |
| S9 | **`<recent_ops>` line grammar taught nowhere** | `t{n} [NO-OP|ERROR ]{tool} {target} {detail}` has no `#` legend and no SP description. Readable by shape today; if legends are the policy, this is the one artifact missing one. |

Self-overlap inside ① (independent of ②/③): the BOARD-digest block first says
the legend "declares each part's line grammar and elided defaults", then
restates that grammar in the next three bullets. The E*/W* commit gate is
stated three times (board_model ×2 sentences, LINTS block, finalize
constraints ×2). The grid read-back rule is stated in board_model and again in
the APPLIED block.

---

## 3. Overlap map — one fact, N homes

| Fact | ① | ② | ③/runtime | Verdict |
|---|---|---|---|---|
| 20-grid snap + read-back + exempt fractions | board_model (5 bullets) + APPLIED block echo | header ¶2, full restatement | resize/update_text warnings at point of use | **contradiction-free triple**; pick one home |
| Object/edge line grammar | BOARD digest block | — | `#` legends, live on every request | ② state-reference explains it, `#` legends reinforce at point of use; ① copy (where S1/S2 rotted) deletes |
| Route notation `─(sN…)→` | ROUTES block (12 lines) | connections spec + edges blurb + shift_segment entry | edges legend, ROUTES rows, shift_segment errors/schema | four homes; ① is the most redundant |
| sN-freshness rule (chain off newest result) | ROUTES block | edges blurb + shift_segment consequence | shift_segment tool description | behavioral — belongs in ① or ②, once |
| Rn request grammar | REQUESTS block (stale, S3) | — | `<requests>` legend (correct) | artifact wins; ① copy deletes |
| Annotation behavior (dispose via resolve_request, disposal is what operator sees) | board_model + REQUESTS block + workflow ×2 | — | requests legend repeats the dispose instruction | behavioral → ① once (board_model); legend keeps its one-liner |
| E*/W* commit gate | board_model + LINTS block + finalize constraints | — | finalize blocked-message lists offenders | behavioral → ① once + finalize checklist restate is defensible |
| Lint line form `E1 rule: message (suggestion)` | LINTS block (implied) | — | lint lines are prose; `lints/run.ts` single source | self-describing; nothing needed |
| Digest indent = containment | BOARD digest block | sections spec (`sections.ts:24`) | `#` legend first clause | legend + ② semantics suffice |
| Closed rosters / glyphs-are-types | board_model pointer + workflow constraint | vocabulary (authoritative) + contact sheet | change_shape notes, refusals | correct as-is: ① points, ② holds |
| `look` contract (one region, composition, board-never-from-look) | state_structure closing bullets (~14 lines) | absent from `<gestures>` | look result self-describes headers; refusal teaches call shape | reference → ② state-reference block; ① keeps the operational when/cadence lines |
| MEASURES semantics (gaps/pitch/free/ink) | MEASURES block | — | rows are labeled but terse | reference → ② (state-reference block, with `look`) |
| Taxonomy & material behavior (only-containers, base section, last-section refusal, chips-not-objects) | board_model (~25 lines) | kind specs + delete consequences already state nearly all of it | — | ② already holds it; board_model dissolves into ② (see P2) |
| Current-board-first image contract + degradation | VIEWS block + closing bullets | — | `<views>` captions + inline failure notes | behavioral core stays ①, compressed |
| Conversation tail is capped; state is current | opener + closing | — | cut-notice line says it verbatim | artifact says it; ① one clause |
| Duplication between look result and ③ is deliberate | implied ("the standing picture is not restated *there*") | — | `perception.ts` docblock | fine |

No true contradictions between ② and runtime were found — the generated
rosters and consequence prose match the surface (the import-time guards are
doing their job). Every rot site found (S1–S3) is in ①'s hand-copied grammar,
which is the argument for the principle in one sentence.

---

## 4. Proposal

Placement principle, final form (review 2026-07-29):

- **① system prompt** = the purpose (including the purpose of the state
  structure: re-derived every request, never stale, results sized to the
  operation), the **actual state structure** (the skeleton, so "look at the
  board" resolves against a named part right there), and the **workflow**.
  Nothing else — no board model section, no grammar teaching.
- **② context** = the information: capabilities, gestures, style — plus a
  **concise grammar key for reading each state thing**: the minimum needed,
  not an explainer. Semi-static; can be added to.
- **③ state** = **just the values.** No descriptions of what is there — no
  `#` legend lines, no inline explainer prose. Attrs stay (counts are
  values); runtime condition notes stay (a render failure or stale snapshot
  is changing state, not grammar); minimal empty markers (`(empty)`,
  `(none)`) stay as values.

> ⚠ The ③ leg reverses the state-round decision that artifacts self-describe
> via legends. Confirmed direction from review, flagged here explicitly since
> it un-builds part of the 2026-07-28 state overhaul (the legend lines) and
> extends to the flat `BOARD` legend in `look` results and the `<requests>`
> body legend.

### P1. ① `state_structure` becomes purpose + skeleton

Replace the ~93 lines of state_blocks with:

- a short purpose paragraph — why state is shaped this way (re-derived each
  request, the standing picture is never restated in results), carrying the
  operational habits that hang off it: post-snap numbers are the ones you
  plan from; NO-OP/ERROR → fix the call, send it again; the
  `{{toolCallCap}}` cadence bullets; `look`/`finalize` ride alone;
- the annotated skeleton (~15 lines): the `<state>` children in order, one
  clause each, shaped like the artifact. No line grammar, no headline
  formats (S1/S2/S3 die unreplaced in ①).

Placement of the cadence/habit bullets — with the skeleton (recommended, they
are state mechanics) vs folded into workflow constraints — is Q2.

### P2. `board_model` dissolves (confirmed in review)

② kind specs already state the taxonomy (only-containers,
base-section-is-the-page, last-section refusal, chips-not-objects) and the
capabilities header already carries the grid rule. `board_model`'s
operational lines are already in ① elsewhere (draft framing in `purpose`,
the E*/W* gate in finalize constraints). The residue with no ② home yet —
description contract, annotation/request model, diagnostics roster — moves
into the ② grammar key (P3). ① no longer contains a `board_model` section.

### P3. New ② block: the concise state-grammar key (name TBD)

A hand-written peer of `<capabilities>`: one compact entry per state child
and per result header — closer to a legend table than prose. Roughly what
the `#` legends say today, moved up a level and completed, written fresh
against the renderers (S1–S5 fixed by construction):

- `<board>`: object line `id type "text" [color] x,y w×h [k=v…]`, indent =
  containment, elided defaults, edge line + extras (incl. `lp=`), text never
  truncated;
- `<recent_ops>` line form; `<diff>`/BOARD DIFF verbs (equals what committing
  ships); `<lints>` line form + the seven-diagnostic roster, one clause each;
  `<requests>` thread grammar (`Rn open target author — "body"`, `↳` replies)
  + dispose-with-resolve_request; `<views>` ordering + degradation forms;
  the conversation-tail cap;
- result headers: APPLIED (report-only notes), DELTA forms, LINTS delta,
  ROUTES + sN notation (indices never renumbered; chain off the newest
  printing), DIAGNOSTICS, the flat `BOARD` form, REQUESTS, NO-OP/ERROR;
- `look`: the framing knob, smallest-set guidance, result composition,
  MEASURES rows (gaps/pitch/free/ink) — one line each;
- the description/title contract (what they are for; workflow keeps the
  steps that maintain them).

Same assembly pattern as capabilities (one more TEXT_BLOCK + folder), and
the same discipline: parity pins against `digest.ts` constants,
`LAYOUT_RULES` ids, and `edge-route.ts` notation, so the key cannot rot the
way ①'s hand-copied grammar did.

### P3a. ③ strips to values (code round, after ② lands)

Remove: both `#` legend lines from the `<board>` children, the combined
legend in `look`'s flat `BOARD` header, the `<requests>` body legend, the
`<recent_conversation>` cut-notice explainer (its fact — "the state block is
the current picture" — moves to ①'s purpose paragraph / ②'s key). Keep:
attrs, empty markers, runtime degradation notes, and the lint suggestion
prose (a suggestion is a finding's content, not grammar). The S9
recommendation (add a `<recent_ops>` legend) is withdrawn — no legends
anywhere.

### P4. The grid rule's canonical home is ② (reversing the pre-review draft)

The material behaves this way, so it is reference: keep the capabilities
header's full statement (already written), and let the new state-reference
block's APPLIED entry carry the read-back consequence. ① retains only the
operational habit, folded into P1's results paragraph ("the numbers that
landed are the ones you plan from"). board_model's five grid bullets go with
board_model. Point-of-use warnings in results stay — enforcement, not
teaching.

### P5. Code follow-ups independent of the grammar move (land first)

snake_case gesture summaries for the three workflow APPLIED lines (S6);
`finalize.ts` calls `diagnosticLines` instead of its inline copy.

### P6. Net effect

① = `purpose` (incl. state purpose) + skeleton (~30 lines together) +
`workflow` (~175) ≈ **~210 lines** (from 361), every sentence either "what we
are doing" or "how to go". ③ sheds its legend/explainer lines from every
request. ② grows ~40 concise lines plus parity pins.
`test/prompt-assembly.test.ts` rewrites alongside: the state-text-grammar and
state-block-subsection tests are deleted; taxonomy/description/diagnostics/
grid pins move into new ② assembly pins (a `context-assembly` test that
snapshots `formatCapabilities()` + the grammar key — ② currently has
import-time roster guards but no sentence-level pins at all); the
perception-delivery pins split between the ① skeleton and the ② key. The
test docblock's promise changes from "the canonical state-text grammar" to
"the purpose, the state skeleton, and the workflow."

### Order of work (after review)

1. P5 code follow-ups (so ② never documents the camelCase forms).
2. ② first: the grammar key + parity pins + context tests — ② must hold the
   grammar before ① and ③ stop holding it.
3. ① rewrite + prompt-assembly test rewrite in one change (raw string
   replacement in prompt.json; regenerate system.md via the kernel render
   CLI).
4. ③ strip (P3a) — legends and explainer lines out of the renderers, their
   tests updated.
5. One traced run to confirm the model reads the board from ② alone — watch
   digest reading, `look` usage, and REQUESTS handling specifically, since
   their teaching moved furthest and ③ no longer reminds.

---

## Open questions for review

1. P3a scope check: the values-only state reverses the state-round
   self-describing-legend decision — confirmed for the two `<board>` legends;
   does it also cover the `look` flat-`BOARD` legend, the `<requests>` body
   legend, and the tail cut-notice as proposed?
2. ① shape: cadence/habit bullets with the skeleton (recommended) or inside
   workflow constraints? And skeleton form: literal mini-`<state>` example vs
   annotated list?
3. Name of the ② grammar key block (e.g. `<state_grammar>` /
   `<reading_the_board>`; never `inspect`).
4. Does the finalize-constraints restatement of the E*/W* gate stay
   (recommended: yes — the checklist restate at the point of commitment is
   the one defensible duplicate, and with board_model gone it is ①'s only
   full statement of the gate)?
5. `author=` extra: one line in the ② key, or leave undocumented?
