# v3 trial wave — synthesis (2026-07-22)

Five parallel trial agents ran the v3 board-editor against all five diagram genres the original
rule eval covered. Per-genre detail with session ids and evidence: `v3-trial-<type>.md`.
Old baseline: `findings-<type>.md` + `scorecard.md`. Architecture: `process-proposal.md` §5;
implementation: `v3-implementation-spec.md`.

## Headline numbers (v3 wave vs. old eval)

| metric | old eval | v3 wave |
|---|---|---|
| DSL syntax retries | ~140 total (11–35 per first session) | **0 across all five batteries** |
| sessions kept (committed + survived operator review) | 12 of 33 | **21 of 23** (1 operator-reject, 1 honest abandon) |
| 20px-nudge-class probes | 0/5 succeeded (all abandoned) | **5/5 landed** (grid-snapped ±4px, honestly disclosed) |
| edge label / style / color requests | refused or hacked (floating chips, node-through routing) | **first-class everywhere** |
| restyle-as-duplicate-edge defect | n/a (restyling impossible) | 1 occurrence pre-fix → **0 after connection inventory** |
| channel survival through re-solve | n/a | **certified on both paths** (no-arrows preservation: flowchart S4; authoritative arrows: swimlane S4, 16/16 edges intact) |

All five genre agents returned **ready to scale**, state machine with one carve-out (self-loops).

## What made the difference (ranked by observed impact)

1. **apply_ops** — most sessions went 100% direct ops; the grammar tax vanished because the
   grammar became optional.
2. **Connection inventory in fit_scope** — turned the restyle probes into one-shots (old: 7-probe
   abandons) and ended duplicate-edge re-adds.
3. **Channel preservation through buildDraft** — re-solves no longer strip labels/styles/colors.
4. **Render-first prompt + honest summaries** — every session rendered before commit; flaws that
   shipped were named in summaries (with two overclaim slips, below).
5. **Grid snap via the shared human-edit path** — surgical probes landed like hand drags.

## Consolidated defect backlog (post-wave state)

Fixed during/after the wave (tests green at 156/0):
- `diffDocuments` dropped `type` changes — pill terminals became rectangles on accept
  (flowchart). Fixed + regression test.
- Self-edge refusal had a false diagnostic ("endpoints unavailable"); now an honest
  "self-loops not yet supported" skip + prompt guidance (state machine S4/S5).

Open — advisory/lint tier (small, prompt- or lint-level):
- **0px cluster collisions ship silently** (org S4): 0 is a ladder rung, gate needs >25%
  overlap. Add a min-separation advisory for unrelated clusters.
- **Lint is rhythm- and chip-blind**: crammed pitch came back "Lint: clean" (swimlane S4 d1);
  label-chip-on-chip and chip-on-node occlusions never flagged (state S3, flowchart, swimlane).
- **Solver output is off the 16px lattice** (132×69, 518×389) while apply_ops snaps — snap
  solver geometry on emit.
- **Solver abstinence**: agents now avoid propose_program/solve_layout entirely in some genres,
  losing fan/align balance guarantees (org: VP 96px off its child midpoint). Prompt should
  recommend a solve_layout balance pass after structural builds.
- **Re-solve vs. accepted tweaks**: a whole-scope re-solve re-derives sizes and quietly reverts
  previously accepted surgical geometry (swimlane S4 reverted S2's +16px lane height; state S4's
  fallback rewrote 8 objects for a one-edge ask). Prompt guidance shipped ("solver is a tool");
  a real fix is pinning accepted geometry through re-solve (solver work, priced in
  process-proposal §3.2).

Open — router tier (known limits, priced in process-proposal §3.2, untouched by design):
- Self-loop lobes; anti-parallel edge separation; skip-lane corridor congestion; label-chip
  placement/occlusion; section-permeable routing.

Open — infra tier:
- Kernel transcript endpoint served a different container's transcript under parallel load
  (org trial; also old eval state-machine S1a). Race in container/transcript resolution.
- :3999 studio proxy stayed dead all day; everything ran on :4820 direct + :4000 studio.
- `accept` still returns ops without persisting (every agent PUTs the canvas itself).
- Parallel agents sharing one scratchpad clobbered each other's temp files twice — trial
  agents now use private subdirs; worth baking into the protocol.

## Status

- Suite: 156 pass / 0 fail (`bun test packages/canvas-agent/test`). Harness on :4820 runs the
  final code. Nothing committed to git.
- Boards: `eval-v3-*` canvases hold the accepted end states (flowchart, swimlane, nested-arch,
  org-tree, state-machine) — visual before/after pairs vs. the old `eval-*` boards.
- This directory is now the full regression kit: PROTOCOL.md + V3-TRIAL-PROTOCOL.md (harnesses),
  findings-* (v2 baseline), v3-trial-* (v3 baseline), scorecard.md (rule verdicts),
  process-proposal.md (architecture + priced backlog).
