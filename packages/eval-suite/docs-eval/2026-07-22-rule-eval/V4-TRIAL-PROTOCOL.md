# v4 trial protocol — round-based, reference-anchored

**2026-07-22 evening addendum:** Trial executors and report writers now run as
`codex exec -m gpt-5.6-sol -c model_reasoning_effort="xhigh"`; see
`packages/eval-suite/RUNNER.md` for executor mechanics. The protocol content below is
otherwise unchanged.

You are trialing the v4 diagnostic-layout system (rules = prompt guidance + measured
diagnostics; the model places freely and iterates on renders; SOL at high thinking, 120 turns).
This is ROUND-based: you run your genre's battery, diagnose what's working and what isn't at
the RULE level, and report; the orchestrator tunes guidance/thresholds between rounds.

Ford's standing critique to test against: outputs are "too close together if you're actually
trying to read it", and judging has not been anchored to the real reference boards. Both are
now your explicit job.

## Reference anchoring — MANDATORY, do this FIRST

Before running any session, render and VIEW the reference boards; they are the bar:
```
curl -s "http://127.0.0.1:4000/api/canvases/gc-decomp-harness/preview.svg?fit=content&pad=48" -o ref-gc.svg
curl -s "http://127.0.0.1:4000/api/canvases/intent-classification-2/preview.svg?fit=content&pad=48" -o ref-intent.svg
qlmanage -t -s 2800 -o . ref-gc.svg ref-intent.svg   # then Read the .png files
```
(Work in a PRIVATE scratchpad subdir — parallel agents have clobbered shared temp files before.)
Anchors: gc-decomp-harness ≈ 7–8 (the bar), intent-classification-2 ≈ 7. Study what makes them
read: generous corridors between stages (every label chip owns clear air), section tints doing
grouping work, color-coded flows, margin annotations, deliberate density variation. Every
aesthetic score you give MUST be a side-by-side judgment against these renders — view your
output PNG and the reference PNG in the same phase and say specifically what the reference does
that your output doesn't.

## Endpoints & mechanics

As `PROTOCOL.md` (sessions, polling in FOREGROUND loops, accept→apply-ops→PUT materialization
via :4000, kernel transcript endpoints). Harness :4820 runs v4: the agent under test has
`board` (digest + diagnostics + exemplar on first call), `apply_ops`, `apply_quickfix`,
`render_draft` (default 2000px), demoted legacy solver tools, and a commit gate that blocks
only error-tier diagnostics. Sessions are SLOWER now (high thinking, render-heavy) — poll up
to 15 min before suspecting death.

## Battery (3–4 sessions)

- S1 build: one rich genre build (reuse your genre's shape from V3-TRIAL-PROTOCOL.md /
  the old findings file), explicitly requesting reference-board finish: tinted regions,
  labeled + styled + colored flows, a margin sticky, READABLE spacing.
- S2 readability iteration — the round's core probe: a follow-up session (or message) of the
  form "Compare against our house standard: give every labeled edge room to breathe, widen the
  corridors, and rebalance so it reads at a glance — polish to reference quality." Watch
  whether the agent actually spreads things out, and whether the new labeled-edge spacing
  warning fires/helps.
- S3 one genre-specific edit probe (pick the sharpest from your genre's v3 battery).
- S4 only if something needs a retest.
Accept + materialize good results; reject clear regressions.

## Report: `v4-trial-<type>.md` (overwrite any earlier same-named file is FORBIDDEN — these are
new files; v3 reports stay as history)... file name: `v4r1-<type>.md`.

Per session: instruction, outcome, tool sequence, renders count, diagnostics story (which
fired, which were heeded/quickfixed/overridden, verbatim override notes from the commit
summary), aesthetic score anchored to the reference (state the side-by-side delta in one
sentence), and crop evidence for anything you claim.

Then the rule-efficacy table — the round's real output. For EVERY rule (spacing incl. the new
labeled-edge breathing check, grid, section-trim, registers, hub-balance, rhythm, density,
label-clearance, overlap, containment, edge-clarity, color-contrast):
- fired? (times) · heeded/quickfixed/overridden? · correct? (false positives? misses you can
  SEE in the render that the rule should have caught?) · verdict: WORKING / NOISY / BLIND /
  MISCALIBRATED (with the threshold you'd change).

End with: top 3 changes you'd make for Round 2 (guidance text, threshold, new rule, or prompt
loop change), each grounded in a specific render/diagnostic moment.
