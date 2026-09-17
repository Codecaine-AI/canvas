# v5 round 2 — state machine

Canvas: eval-v5-state-machine · Sessions run: 3 (S1 build, S2 readability probe, S3
structural edit — same battery and instructions as Round 1) · Date: 2026-07-22 · Harness:
:4820 v5 (5 graph lints; full `<style_guide>` [9 topics] + `<board_state>` injected at
spawn; every apply_ops returns DELTA + LINTS delta + an auto close-up render) · Baseline:
`v4r1-state-machine.md`.

Reference anchoring was repeated during recovery: gc-decomp-harness (bar ≈7.5) and
intent-classification-2 (≈7) were rendered at 2800px and viewed beside the three stage renders
and final Studio render. Scores are side-by-side visual judgments against those anchors. The
recovered Studio SVG matches the interrupted executor's saved final SVG; the 2800px evidence is
in `v5r2-state-machine/final-committed.png` in the session scratchpad.

Recovery/materialization audit: all three sessions were already `accepted`; none was rejected.
For S2, 13/15 proposed effects still match exactly and the other two (`state-degraded` and
`degraded-recovery-port`) were intentionally superseded by S3 geometry. S3's 6/6 effects are
present. The whole live canvas is canonically identical to the interrupted executor's expected
final document (17 objects, 12 connections), so the full S1 → S2 → S3 chain was already
materialized. No proposal replay, PUT or new harness session was needed.

## Sessions

### S1 — build: six-state connection lifecycle with failure/recovery semantics
- session/container: b0b766f1-75cd-4bba-a32d-98ed3e99e106 /
  18f1f89d-fe33-57d9-b69d-eac618916073
- outcome: committed → accepted → already materialized; 18 turns, ~4.2 min, 0 tool errors.
- tool sequence: board ×2, apply_ops ×9, render_draft ×5, commit. Accepted op mix:
  addObject 14, addConnection 9, updateObject 1 (24 ops).
- what landed: all six requested states, nine labeled transitions, blue happy-path and orange
  recovery regions, semantic blue/red/green/teal channels, a useful failure-semantics sticky and
  a visible heartbeat badge. This is substantially more structured than v4's first build.
- lint story: frame-balance's seed-board warning dissolved after construction. The transition
  batch triggered covered-content (3E + 1W), broken-edges anti-parallel warnings ×2 and one
  unreadable-labels warning; the next two edits cleared them. Diagnostics were clean before
  commit.
- misses: the tool/router could not draw the requested heartbeat self-loop, so the agent used a
  `↻ heartbeat · every 30s` badge and disclosed the workaround. More seriously, five 32px rings
  are described by the sticky as “routing anchors, not states,” but they are ordinary ellipse
  objects. Three stored transitions terminate on those ellipses rather than on their stated
  states: timeout → `idle-failure-port`, recovered is port→port, and session resumed is
  port→port. The visual contact hides the semantic break.
- aesthetic (anchored): **6.5** — readable and semantically colored, with strong region grouping
  and generous label air. It remains below the ≈7 anchor because both regions are very sparse,
  long recovery routes dominate the composition, and the five rings read as unexplained nodes.
  Delta vs v4 S1: +0.5.

### S2 — readability probe: widen corridors and rebalance
- session/container: 549ebecf-1c66-4d0a-a5e1-2d61e7f38b21 /
  576daaf2-a849-5ce0-8a69-168fd500ecd1
- outcome: committed → accepted → already materialized; 9 turns, ~2.1 min, 0 tool errors.
- tool sequence: board, apply_ops ×4, render_draft ×3, commit. Accepted op mix: updateObject 15,
  a pure geometry pass.
- what changed: the happy-path register tightened, the two regions acquired a 224px corridor,
  the recovery loop was spread into a clearer lower cluster, and the margin note remained aligned
  with the failure band. Labels are easier to scan without topology/style churn.
- lint story: the first move exposed three covered-content errors on the handshake/close routes;
  the next move replaced them with one covered-content error and one unreadable-labels warning.
  Both were fixed, then a seven-object finishing move remained clean. This is a compact,
  effective lint-response loop.
- aesthetic (anchored): **6.5** — materially calmer than S1 but not a full score step: the huge
  low-density panels and routing rings keep it below intent-classification-2. Delta vs v4 S2:
  +0 on score, with better tint and color craft.

### S3 — structural edit: add violet Suspended and three transitions
- session/container: fe0d6d64-3bc3-4d2a-82bf-33dc94ef0289 /
  79f8065e-a5cd-503e-a2e1-bb7f19f3886e
- outcome: committed → accepted → already materialized; 8 turns, ~1.45 min, 0 tool errors.
- tool sequence: board ×2, apply_ops ×3, render_draft ×2, commit. Accepted op mix: addObject 1,
  addConnection 3, updateObject 2 (6 ops).
- what landed: Suspended sits between Connected and Reconnecting; suspend(), quarantine and
  resume window are all solid violet; Degraded shifts right; every old object, label, style and
  color survives. The edit is unusually surgical and fast.
- lint story: the first batch produced two covered-content errors and two covered-content
  warnings around the new violet routes. One reroute reduced that to an unreadable-labels warning
  on the 112px resume-window gap; the final shift cleared it. Commit and the recovered live
  document both diagnose clean.
- aesthetic (anchored): **6.5** — the violet sub-cycle is clear, label chips own air and the
  visual semantics are excellent. Side by side, gc-decomp still packs far more meaning into its
  space, while this board has one uniform sparse density and several very long cross-region
  runs. Delta vs v4 S3: +0 on score.

## Final board vs Round-1 board (both anchored to the same references)

The v5 final is cleaner at the macro level than v4: explicit tinted semantic regions, stronger
color grammar, a flatter happy-path register and a well-integrated Suspended edit. It does not
improve the anchored score because five routing rings remain and three transitions are not
stored state→state; the heartbeat is also annotation rather than topology. Net: **v5 final ≈6.5
vs v4 final ≈6.5, about 0.5 below intent-classification-2 and 1 point below gc-decomp**. The
visual result is credible; the underlying state graph is not fully faithful.

## Lint-efficacy table (5 lints, all three transcripts)

`apply_quickfix` was not used. No overrides, rejects or commit-gate blocks occurred; every
finding was handled through ordinary operations.

| lint | fired | heeded? | correct? | verdict |
|---|---|---|---|---|
| covered-content | all stages (S1 six positive events; S2 four initial/positive errors; S3 2E + 2W) | yes, within 1–2 turns | every chip/edge contact was real; final labels visibly own air | **WORKING** — strong v5 result on the Round-1 defect class; it cannot validate endpoints or self-loop semantics |
| containment | 0 | — | no visible state escaped its region/frame | WORKING-idle; semantic membership is not geometric containment |
| broken-edges | S1 ×2, then silent | the agent reacted by adding/using ring endpoints | the anti-parallel warnings were real, but the remedy was worse than the symptom | **BLIND to routing scaffolds** — should have fired in S1 and persisted through S2/S3 because three named state transitions terminate on five tiny unlabeled ellipses rather than states; clean diagnostics incorrectly certify the graph |
| unreadable-labels | S1 ×1, S2 ×1, S3 ×1 | all heeded immediately | all three raised-floor warnings match the renders and produced better corridors | **WORKING** — well calibrated and low-noise in this genre |
| frame-balance | S1 seed ×1 | dissolved during construction | true but not actionable on a two-object seed; correctly silent at commits under its current threshold | WORKING, minor startup noise; it does not detect the final regions' uniform low density |

## Style adherence (did behavior follow each topic unprompted?)

| topic | verdict | evidence |
|---|---|---|
| Spacing and corridors | FOLLOWED | 128px+ label corridors and a 224px inter-region channel; S3 stayed readable under added topology |
| Grid discipline | FOLLOWED | accepted geometry is on the 16px grid; no snap-cleanup needed |
| Section framing | PARTIAL | regions are clear and labeled but much larger than their contents, leaving uniform dead interiors |
| Registers and rhythm | FOLLOWED | happy-path and recovery states form intentional registers; Suspended joins without kinking existing rows |
| Fan composition | n/a | no fan of three or more |
| Color semantics | FOLLOWED | blue establishment, red dashed failures, green recovery, teal close, violet suspension; all preserved through S3 |
| Connectors and labels | **PARTIAL / semantic failure** | chips are excellent, but five relay/port dots violate the no-scaffolding rule; all 12 final connections omit explicit anchors; three transitions are port-ended |
| Tree edge entry | n/a | no hierarchy tree |
| Lanes and corridors | FOLLOWED visually | failure/recovery routes use a clear cross-region lane, though two of those lanes are encoded via fake endpoint objects |

Core v5 hypothesis check: style guidance and the raised label floor work. S2/S3 are efficient,
low-noise look-adjust-look loops, and the agent preserves color/register craft through a topology
edit. The unmodeled failure is structural: the five-lint suite judges geometry but never asserts
that a state-machine transition's endpoints are states. A visually clean render can therefore
hide a broken machine.

## Top 3 changes for Round 3

1. **Add semantic endpoint validation to broken-edges.** In a state machine, labeled transitions
   should begin/end on state nodes; flag tiny unlabeled ellipse endpoints and proximity-only
   attachments. Grounding: timeout, recovered and session resumed are not stored between their
   named states, yet all three sessions finish clean.
2. **Provide a real self-loop primitive or documented routing recipe.** The user explicitly asked
   for a Connected heartbeat self-loop; S1 could only create a badge and say so. A topology lint
   should also detect when a required self-transition is represented only by annotation.
3. **Teach proactive anchors and reject routing furniture as a repair mode.** All 12 final edges
   omit anchors even when faces are obvious. Correct `from/to.anchor` use would remove most rings,
   reduce long routes and keep the graph faithful without weakening covered-content.
