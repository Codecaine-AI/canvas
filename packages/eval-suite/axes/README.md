# Axes — shared grading rules

One file per axis, all in the **canonical structure** below. A judge session is
instantiated from [JUDGE-PROMPT.md](JUDGE-PROMPT.md) + exactly one axis file — the judge
never needs anything else from this directory except this README.

**The active axis set is simply the axis files present here.** To add an axis: write a
new file in the canonical structure, give it a unique `code` and the next
`scorecard-order`, and the runner picks it up. To remove one: delete the file. Either
way, the scorecard's column set changes — note that in the run header and don't compute
Δ columns against runs with a different axis set.

Current axes, in scorecard order:

| code | file | measures |
|---|---|---|
| SQ | [sq.md](sq.md) | static quality — how the board looks next to the references |
| IC | [ic.md](ic.md) | information comprehension — what the render transmits, by blind reconstruction |
| IF | [if.md](if.md) | intent fidelity — did every specced item land |
| ES | [es.md](es.md) | edit stability — does what should stay, stay |
| PH | [ph.md](ph.md) | process health — mechanically clean, honest sessions |

## Canonical structure (every axis file)

```markdown
# <CODE> — <Name> (1–10)
- code: <CODE>
- scorecard-order: <n>
- scored: <per scenario | per edit, then averaged>
- roles: <single judge | the roles, if more than one session is involved>

*One-line statement of what it measures.*

## Judge inputs        Sees: / Never sees: — per role if multi-role. Exhaustive.
## Method              How the judgment is produced, step by step.
## Rubric              The 1–10 table with concrete anchors.
## Caps & overrides    Hard caps, gates, exclusions. "None." if none.
## Output contract     Exactly what the judge session must emit. Evidence-free
                       scores are bounced by the scorecard assembler.
## Notes               Anchor provenance, axis-specific traps, calibration notes.
```

## Rules that apply to every axis

- **Independent judges.** Each axis is scored by its own judge session per scenario. No
  judge sees another axis's output, per the isolation lists in each file's Judge inputs.
- **Anchored, never absolute.** All aesthetic judgment is side-by-side against the
  reference boards: `gc-decomp-harness` = **7.5**, `intent-classification-2` = **7.0**,
  rendered via `GET :4000/api/canvases/<id>/preview.svg?fit=content&pad=48` at ≥2400px
  and VIEWED in the same judging phase as the output under grade. Render-judged axes
  re-score both references first, every run; drift beyond ±0.5 → the score is flagged
  `CAL-DRIFT` and the judge session is re-run before the scorecard is finalized.
- **Half-points allowed.**
- **Evidence or it didn't happen.** Every score must arrive with its axis's Output
  contract fulfilled; the assembler bounces bare numbers back to the judge.
- **Anchor vocabulary.** Rubric anchors cite the 2026-07-22 round-1 corpus
  (`docs/agent-eval/2026-07-22-rule-eval/`): "old system" = the fit_scope/solver DSL,
  "v3" = the v3 trial, "v4" = diagnostic-layout round 1. The anchor boards still exist
  (`eval-*`, `eval-v3-*`, `eval-v4-*` on :4000) — when in doubt, render the anchor and
  look.
- **Scoring unit.** Axes score the whole scenario arc (build + edits) unless the axis
  file says otherwise (ES scores per edit and averages).
- **No double-penalizing declared substitutions.** An honestly declared substitution
  (e.g. "self-loop unsupported, used an anchored badge") fails its IF item but is not
  additionally punished by PH or capped — each axis file states its own handling.
- **Infra failures are nobody's score.** Harness deaths and kernel/proxy failures mark
  the stage `INVALID(infra)` — excluded from scoring, counted in the scorecard header's
  infra line.

## Reporting

Axes are reported **separately** per scenario; there is no primary blended score. For
trend lines only, the scorecard may carry a composite
`0.30·SQ + 0.30·IC + 0.20·IF + 0.10·ES + 0.10·PH` — never use it to decide anything an
individual axis can decide. (If the axis set changes, re-derive the composite weights
deliberately and note the change; don't improvise them in the assembler.)

**Discrimination requirement:** the suite is only useful if the axes move
independently. The dry run (`../dry-run-2026-07-22.md`) demonstrates the baseline
spread; any future run where two axes correlate near-perfectly across all scenarios
should trigger a rubric review — one of them has collapsed into the other.

If the reference boards are ever edited, re-derive their calibration scores by panel
judgment and record it here.
