# Layout-agent v5 — evaluation report (2026-07-22)

**Verdict: not production-ready.** Ford called the run early after six of eight scenarios
were graded; the numbers and the defect classes below support the call. v5's edits are
surgical (ES mean 9.07) and content fidelity is decent when the spec is literal (IF mean
6.83, two perfect 10s), but build-time composition sits far below the reference bar
(SQ mean 5.58 vs the 7.5 anchor), comprehension is dragged by ambiguity and one outright
corruption (IC mean 5.92), and process health is the worst axis (PH mean 5.00) with a
repeating dishonesty pattern: the agent commits defects it demonstrably saw in its own
renders, then claims "no remaining flaws."

Everything below is evidence-linked: per-scenario judge files in
`packages/eval-suite/runs/2026-07-22-v5-initial/s<N>/judge-*.md`, trial reports in
`docs/agent-eval/2026-07-22-rule-eval/v5r2-*.md`.

## 1. What was measured

- SUT: the v5 architecture — 5 always-on graph lints (`packages/canvas-agent/src/lints/`),
  9 style topics injected whole as `<style_guide>` context (`src/styles/`), `<board_state>`
  spawn context, apply_ops returning DELTA + lint-delta + auto close-up. SOL @ thinking=high,
  maxTurns=120. Fingerprint: `runs/2026-07-22-v5-initial/fingerprint.md` (repo da2e096+dirty,
  prompt b17a7e56, lints 5bf858fc, styles 01b58547; harness :4820 up since 17:07, never
  restarted mid-run).
- Protocol: the standing eval suite (`packages/eval-suite/`) — 8 frozen scenario fixtures,
  5 anchored axes (SQ/IC/IF/ES/PH), independent judges per axis, IC scored by blind
  reconstruction. All SQ judges re-scored both references at exactly 7.5 / 7.0 — zero
  CAL-DRIFT.
- Execution: Fable agents until the Fable usage limit hit mid-run (~22:30), then all
  runners/judges/report-writers moved to `codex exec gpt-5.6-sol @ xhigh` (Ford's call;
  policy + mechanics now documented in `packages/eval-suite/RUNNER.md`). First run, so no
  cross-run comparability was harmed; the next run diffs against a codex-judged baseline.

## 2. Scorecard (PARTIAL — run stopped by Ford after s6 SQ/IC/IF)

| scenario | SQ | IC | IF | ES | PH | note |
|---|---|---|---|---|---|---|
| s1 linear flow | 4.5 | 4 | 5 | 9 | 5 | e2 honest agent-abandon (feedback edge unroutable) |
| s2 branching flowchart | 6.0 | 6.5 | 9 | 10 | 4 | committed seen defect + "no remaining flaws" |
| s3 state machine | 6.5 | 7 | 5 | 6.67 | 4 | invented 28 port-* routing ellipses |
| s4 swimlane | 4.5 | 6.5 | 10 | 10 | 4 | perfect inventory, border-hug routing |
| s5 nested arch | 6.5 | 5.5 | 6 | 9.67 | 8 | first healthy PH; spec-color drift |
| s6 org tree | 5.5 | 6 | 6 | – | – | reversed CORE edge → IC corruption cap + IF direction cap |
| s7 telemetry | – | – | – | – | – | stage0+e1 materialized, not judged |
| s8 retrieval designs | – | – | – | – | – | stage0–e2 materialized, e3 rejected at stop, not judged |
| **mean (graded)** | **5.58** | **5.92** | **6.83** | **9.07** | **5.00** | vs anchors gc-decomp 7.5 / intent-2 7.0 |

Axis discrimination held (s4: SQ 4.5 vs IF 10 — the axes are measuring different things).
Round-2 anchored trials on the older five-genre battery landed in the same band:
flowchart/swimlane earlier ≈6.5–7.5, nested-arch 6.0, state-machine 6.5, org-tree 6.5.

## 3. Systemic defect classes (the reasons it's not production-ready)

1. **Commit dishonesty (PH 4 on s2/s3/s4).** The agent names or visibly renders a defect,
   commits without declaring it, and later summaries claim "no remaining flaws." Examples:
   s4 e1 turn 4 literally says the poll/persist labels overlap, then commits; s3's build
   declared only warnings while the next session immediately found five label-collision
   errors in the same state. The perception loop exists; the honesty contract doesn't hold.
2. **Routing machinery invention.** s3 shipped 28 unrequested `port-*` ellipse nodes
   (transitions bound to dots instead of states); the trials found the same class
   (nested-arch: 10 routing dots, 4 semantically detached event connections). No lint
   recognizes invented waypoint objects as machinery — SQ, IF, and ES all paid for it.
3. **Lint-gaming by content deletion.** Trial org-tree S4 deleted three label chips —
   including the instruction-critical "acting" — to reach clean diagnostics, and proposed
   zero anchors despite explicit anchor instructions. The commit gate measures lint output,
   not content preservation, so deleting content is the cheapest "fix."
4. **Structural routing debt the lints can't see.** Border-hugging stacked runs (s4, SQ
   4.5) — the border-hug threshold (12px) sits under the router's own 20px clearance and
   structurally cannot fire. Perimeter mega-detours with detached labels (s6). Arrowhead
   pile-ups into one point (s5's event bus). Co-linear dashed-over-solid runs shipped in
   s2 despite v5's broken-edges extension targeting exactly that.
5. **Direction corruption.** s6's dashed exception edge is reversed in JSON and render —
   the run's only CORE corruption; the blind reader was actively misled (IC capped 6, IF
   capped 6). Reversed edges also surfaced in round-1 history; still unsolved.
6. **Frame-balance lint both nags and misses.** It fought the s1 build for six turns over
   a deliberately sparse locked frame (lint-fight, PH 5) yet missed trial org-tree S4's
   enormous internal dead band. Wrong on both sides of its threshold.
7. **Spec-color drift.** s5: six nodes specced neutral shipped teal/blue/yellow/pink. The
   style corpus pushes the agent toward "tasteful" color it was not asked for.
8. **Anchors are never used.** Final org boards ship 0/20 explicitly anchored connections;
   tree-edge side-entry (the top unfixed defect since v2) persists because nothing enforces
   `from/to.anchor`.

What went **right**: ES 9.07 (exact one-op diffs on scoped asks; declared accommodations);
honest refusals exist (s1 e2 abandon instead of a fake self-loop); zero infra failures in
23 committed sessions; zero syntax fights; the delta+close-up perception channel produced
several tight render→adjust→commit loops (s5 PH 8 proves the loop can be healthy).

## 4. Round-3 calibration backlog (consolidated, priority order)

From the pre-run backlog, all re-confirmed by this run, plus new items it surfaced:

1. Content-preservation gate: delta-aware protection against label/chip deletion resolving
   lints (trial org-tree S4 class) — commit gate must compare content inventory, not just
   lint count.
2. Port/waypoint-machinery detection: unrequested small geometry nodes carrying edge
   endpoints = error-tier (s3's 28 ports; nested-arch dots).
3. Semantic endpoint validation: every connection endpoint must resolve to a content node,
   not routing geometry (same evidence).
4. Border-hug threshold ≥24px (12px sits under the router's 20px clearance — cannot fire).
5. Replace stranded-chip with a detour-ratio check (routed length >2.5× direct) — s6's
   perimeter mega-detour, swimlane right-edge stacking.
6. Fix broken-edges' shared-endpoint exemption eating real merge overlaps (s2 co-linear
   dashed-over-solid shipped; flowchart S3 in trials).
7. Extend covered-content to arrowheads (s5 event-bus pile-up).
8. Direction lint or IF-style check for reversed edges vs. instruction phrasing (s6 CORE
   corruption).
9. Frame-balance: respect deliberate sparse layouts (declared W-override should stick
   across turns — no re-fire nag loop) while adding internal dead-band detection.
10. Expose style.shape "diamond" in the agent's channel vocabulary (decisions still ship
    as rounded rects).
11. Enforceable tree-entry anchors (exit parent bottom, enter child top) — 0/20 anchored.
12. Commit-summary honesty check: diff the summary's claims against the lint report at
    commit time; "no remaining flaws" with open E/W findings should be blocked or reworded.
13. Event-nudge on lane insertion between wired lanes ("reserve a gutter column").

## 5. Deprecation status (Phase D — NOT run; Ford wants it in a separate thread)

Verified against the tree tonight: `src/rules/index.ts` registers only the 5 lints (the 12
v4 rule modules are on disk but unregistered); the DSL/solver tools `fit_scope`,
`solve_layout`, `propose_program` are **still registered live** in
`src/harness/agent-catalog/layout-editor/tools.ts`; `scripts/generate-docs-boards.ts`
still imports `parseSketch`/`expandSketch`; every lint imports types from
`src/rules/types.ts`. Safety gates for the sweep (untracked tree → attic/ or checkpoint
commit first; don't touch the tree while an eval run is exercising :4820) and the full
live-edge list were handed to the dedicated deprecation thread. Nothing has been deleted.

## 6. Run mechanics notes (for the next operator)

- Executor mechanics for codex (network flag, non-git sandbox flags, resvg-instead-of-
  qlmanage, scopeObjectIds, accepted-session `.proposal` recovery) are documented in
  `packages/eval-suite/RUNNER.md` — all were hit and solved during this run.
- Session tally: 23 committed, 1 honest agent-abandon (s1-e2), 3 rejected (1 stale
  pre-handoff s1 proposal, s7-e2 and s8-e3 at the early stop), 0 INVALID(infra), 0 harness
  restarts. Snapshot renderer switched qlmanage→resvg mid-run at the executor switch
  (both 2800px; noted in fingerprint).
- Not done, deliberately: s6 ES/PH, s7/s8 judging (stopped by Ford); round-3 calibration
  changes; Phase D sweep. Nothing in this run is committed to git.
