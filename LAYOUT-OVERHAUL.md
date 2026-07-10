# Layout Overhaul — Session Plan

**Session 1 of 2.** This session audits and stabilizes the canvas repo file
tree. It ends with the tree **frozen** at a commit. The companion session
([DOCS-OVERHAUL.md](DOCS-OVERHAUL.md)) then rewrites the docs against that
frozen tree — do not start it until this session lands.

## Goal

Get the repo into a state where the file tree is stable and every file has an
obvious home, governed by a stated rule — so the docs overhaul can reference
paths that will not move again.

## Scope

**In scope**
- Everything under the repo root: `packages/canvas`, `packages/studio`
  internals, root-level strays, `tools/`, `to_add/`, `board-design-reference/`,
  `canvases/`.
- Deleting dead files, relocating misplaced ones, consolidating scattered ones.
- Import-path rewrites forced by moves.

**Out of scope**
- Vendored assets stay (`tools/nucleo-icons` and the vendor-only-used-assets
  convention: only referenced library files are copied in, one file per icon
  with an index barrel). Do not restructure vendor internals.
- No docs content edits. Doc references to old paths **will go stale in this
  session — that is expected**; the docs session fixes them.
- No behavior changes, no refactors beyond what a move mechanically requires.

## Phases

### 1. Inventory (read-only)

Walk the full tree and classify every top-level entry and every directory
inside `packages/canvas/src` and `packages/studio/src`. Known items needing a
verdict:

- `OBJECT-DEF-OVERHAUL.md`, `PROVENANCE.md` at root — likely belong in `docs/`
  or should be retired (their content may already be superseded by `docs/`).
- `to_add/` ("black pop up", "connector-stuff") — triage: integrate, file as a
  doc/reference, or delete. This folder should not survive the session.
- `tools/` — mixed bag: `docs-framework` (submodule, stays), `nucleo-icons`
  (vendor, stays), `migrations`, `migrate-canvas-docs`, and loose files
  (`palette-contact-sheet.html`, `palette-contact-sheet.ts`). Decide the rule
  for what belongs in `tools/` and place accordingly.
- `board-design-reference/` — reference material; decide whether it lives at
  root, under `docs/`, or under a `reference/` convention.
- `canvases/` — fixture corpus (deliberately culled to a small set; also feeds
  the DOM-equivalence harness). Probably stays, but confirm and state the rule.
- Root config strays (`happydom.ts` etc.) — keep at root only if tooling
  requires it there.

### 2. Proposal → approval gate

Produce the proposal as a markdown file at root (e.g. `LAYOUT-PROPOSAL.md`):
the target tree, a move/delete/keep table, and the placement **rule** each
decision follows. **Ford approves the target tree before anything moves.**
Nothing in phase 3 starts without that approval.

### 3. Execute moves

- All file edits/moves run through Codex (`codex exec`, per the global
  sub-agent rule — workers orchestrate, Codex implements). Mechanical moves
  and import rewrites: `low` effort. Anything requiring judgment about an
  import graph: `xhigh`.
- Fan out: independent move groups run as parallel Codex invocations.
- Group commits logically (e.g. root-stray cleanup, `to_add` triage, `tools/`
  consolidation) so each is independently revertable.

### 4. Verify

The suite is **already red at HEAD** — "suite green" is not an acceptance
criterion. As of 2026-07-09 there are 6 known pre-existing failures
(ObjectShape below-slot text, outline-anchor-baseline connection-cascade,
three v2-flow canvas JSON tests, zz-dom-equivalence baseline). Procedure:

1. Before any move, capture the failure set from a pristine tree at HEAD:
   `bun test packages/canvas/src` and record which tests fail.
2. After moves: `bun run typecheck` (both packages) and re-run the suite.
   Acceptance = **failure set unchanged**, not zero.
3. DOM-equivalence gate: `bun test zz-dom`. Moves must not change rendered
   DOM. **Never regenerate `zz-dom-baseline.json` or
   `outline-anchor-baseline.json` to get green** — that bakes drift into the
   corpus. If a baseline entry is legitimately invalidated, prune only the
   affected keys.
4. `bun run dev:studio` boots and renders a canvas fixture.

### 5. Freeze

Final commit lands the stable tree. After this commit the tree is **frozen**:
layout regrets discovered later (including during the docs session) go on a
queue for a future round — they do not reopen the tree unless blocking.

## Exit criteria

- Approved proposal executed; `to_add/` gone; every root entry has a stated
  home rule.
- Typecheck clean; test failure set identical to the pre-move capture.
- Tree committed. `LAYOUT-PROPOSAL.md` updated to reflect what actually
  happened (it becomes the input for the docs session's structure pass).

## Cross-session hazards

Concurrent sessions on this shared tree have clobbered uncommitted files
before. Commit in small logical units as you go; before verifying or reporting
any file's state, re-read it from disk rather than trusting an earlier read.
