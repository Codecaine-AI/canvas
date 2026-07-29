# Board-grammar audit — prompt stack ① / ② / ③

2026-07-28. Analysis only; no prompt or context edits. Scope: how the board
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
| Object/edge line grammar | BOARD digest block | — | `#` legends, live on every request | artifact wins; ① copy is where S1/S2 rotted |
| Route notation `─(sN…)→` | ROUTES block (12 lines) | connections spec + edges blurb + shift_segment entry | edges legend, ROUTES rows, shift_segment errors/schema | four homes; ① is the most redundant |
| sN-freshness rule (chain off newest result) | ROUTES block | edges blurb + shift_segment consequence | shift_segment tool description | behavioral — belongs in ① or ②, once |
| Rn request grammar | REQUESTS block (stale, S3) | — | `<requests>` legend (correct) | artifact wins; ① copy deletes |
| Annotation behavior (dispose via resolve_request, disposal is what operator sees) | board_model + REQUESTS block + workflow ×2 | — | requests legend repeats the dispose instruction | behavioral → ① once (board_model); legend keeps its one-liner |
| E*/W* commit gate | board_model + LINTS block + finalize constraints | — | finalize blocked-message lists offenders | behavioral → ① once + finalize checklist restate is defensible |
| Lint line form `E1 rule: message (suggestion)` | LINTS block (implied) | — | lint lines are prose; `lints/run.ts` single source | self-describing; nothing needed |
| Digest indent = containment | BOARD digest block | sections spec (`sections.ts:24`) | `#` legend first clause | legend + ② semantics suffice |
| Closed rosters / glyphs-are-types | board_model pointer + workflow constraint | vocabulary (authoritative) + contact sheet | change_shape notes, refusals | correct as-is: ① points, ② holds |
| `look` contract (one region, composition, board-never-from-look) | state_structure closing bullets (~14 lines) | absent from `<gestures>` | look result self-describes headers; refusal teaches call shape | see P6 — the one genuinely open placement |
| MEASURES semantics (gaps/pitch/free/ink) | MEASURES block | — | rows are labeled but terse | reference → ② (new perception topic) or stays ① with `look` |
| Current-board-first image contract + degradation | VIEWS block + closing bullets | — | `<views>` captions + inline failure notes | behavioral core stays ①, compressed |
| Conversation tail is capped; state is current | opener + closing | — | cut-notice line says it verbatim | artifact says it; ① one clause |
| Duplication between look result and ③ is deliberate | implied ("the standing picture is not restated *there*") | — | `perception.ts` docblock | fine |

No true contradictions between ② and runtime were found — the generated
rosters and consequence prose match the surface (the import-time guards are
doing their job). Every rot site found (S1–S3) is in ①'s hand-copied grammar,
which is the argument for the principle in one sentence.

---

## 4. Proposal

Placement principle (agreed in the state round): grammar lives in the
artifacts, reference lives in ②, behavior lives in ①.

### P1. `state_structure` sheds the ten state_blocks (~93 lines → ~10)

Replace the block-by-block grammar school with a compact contract:

- Keep: the re-derived-per-request opener; the one-sentence naming of the
  eight children; **a new one-sentence policy that every block carries its
  own grammar** — `#` legends declare line grammar and elided defaults, attrs
  carry the counts, and the result headers (`APPLIED`, `DELTA`, `LINTS`,
  `ROUTES`, `REQUESTS`, `MEASURES`, `DIAGNOSTICS`, `NO-OP`, `ERROR`) say what
  they are — read them literally.
- Keep, as behavior: results report post-snap numbers — compute the next
  gesture from them; notes under APPLIED are report-only; `BOARD DIFF` equals
  what committing ships; NO-OP vs ERROR ("fix the call, send it again");
  result-sizing principle; the cadence bullets (`{{toolCallCap}}`, unchanged
  this round).
- Delete: APPLIED verb-roster flavor, both digest line grammars (S1/S2 die
  with them), DELTA's seven line forms, LINTS' three headline forms, the
  ROUTES notation lines, the MEASURES row glossary (see P6), the REQUESTS
  grammar (S3 dies), VIEWS' caption enumeration (keep the degradation +
  current-board-first sentences).

### P2. `board_model` stays the behavioral home, minus echoes

Keep taxonomy, containment, grid (the canonical statement — see P4),
description contract, diagnostics gate (the one full statement; finalize's
checklist restate may stay). Drop the APPLIED-block grid echo and one of the
two gate sentences when the state_blocks go.

### P3. Grammar deltas already owed to ③ regardless of the rewrite

Code follow-ups, separate from prompt edits: snake_case gesture summaries for
the three workflow APPLIED lines (S6); `finalize.ts` calls `diagnosticLines`
instead of its inline copy; decide whether `<recent_ops>` gets a `#` legend
(S9) — recommended, it's the only legend-less child; optionally a DELTA
micro-legend. Each is a small change in a single-source file.

### P4. The grid rule gets one home: ① `board_model`

It is world behavior, its best prose already lives there, and the
prompt-assembly tests pin it there. Delete ② capabilities header ¶2 (the full
restatement). The point-of-use warnings in results stay — they're enforcement,
not teaching.

### P5. ② absorbs the reference residue of the deleted blocks

- Route notation: already in the edges legend + ② connections; add the
  "indices are never renumbered" clause to the connections steering topic when
  the ROUTES block dies (it's the one fact currently only in ①).
- Nothing else from the state_blocks needs a ② home — S3's grammar is in the
  requests legend, digest grammar is in the `#` legends.

### P6. Open question — where `look` is taught (recommend: ②)

`look` is the only tool taught exclusively in ① (~14 lines of closing
bullets + the MEASURES block), because ②'s `<gestures>` is generated from the
operations roster and workflow tools have no home there. Recommend a
hand-written `<perceiving>` block in ② (peer of `<gestures>`): what `look`
frames, what comes back, MEASURES row semantics, smallest-set framing
guidance. ① keeps only the behavioral cadence lines ("look/finalize ride
alone", "use look when judgment needs a close-up", edit-from-results). This is
the largest judgment call in the proposal; the alternative (leave `look` in ①,
move only MEASURES glossary to ②) is defensible if ① should keep everything
cadence-adjacent.

### P7. Net effect on ①

state_structure ~120 → ~40 lines (opener + self-description policy +
behavioral results paragraph + cadence/look bullets); prompt total ~360 →
~270–280. `test/prompt-assembly.test.ts` rewrites alongside: the
"specifies the state-text grammar" test dissolves into a much smaller
"states the self-description policy" pin; "gives every state block its own
delimited subsection" is deleted; the perception-delivery, grid, taxonomy,
description, diagnostics, and workflow pins survive nearly untouched. The
docblock at the top of the test (which promises "the canonical state-text
grammar" lives in the prompt) is rewritten to promise the policy instead.

### Order of work (after review)

1. P3 code follow-ups land first (so ① never describes the camelCase forms).
2. ② edits: header ¶2 deletion, connections addition, `<perceiving>` block
   (pending P6 decision).
3. ① rewrite + test rewrite in the same change (raw string replacement in
   prompt.json, then regenerate system.md via the kernel render CLI).
4. One traced run to confirm the model still reads legends correctly with the
   SP grammar gone.

---

## Open questions for review

1. P6: `look` reference to ② as `<perceiving>`, or stay in ①?
2. P4: agree grid's single home is ① (deleting ② header ¶2)?
3. S9: add the `<recent_ops>` legend, or accept one legend-less child?
4. Does the finalize-constraints restatement of the E*/W* gate survive the
   dedup (recommended: yes — a checklist restate at the point of commitment
   is the one defensible duplicate)?
5. `author=` extra: operator-attributed objects render it, and no prompt or ②
   text mentions the field at all. Fine to leave to the legend's generic
   `[k=v…]`, or does ② stickies/objects want one line?
