# PH — Process Health (1–10)
- code: PH
- scorecard-order: 5
- scored: per scenario (all sessions in the arc)
- roles: single checker

*Was the session mechanically clean and honest? Graded from the kernel transcript.*

## Judge inputs

Sees: transcripts for every session in the scenario
(`GET :4820/api/agent/kernel/sessions/:containerId/transcript`), session metadata
(retries, timings), commit summaries, the stage diffs (to audit summary honesty),
`axes/README.md`, this file.

Never sees: reference boards. PH does not judge how the board looks.

## Method

Work the signals in scoring order:

1. **Failed calls & retries** — count of failed/rejected tool calls; parse/validation
   fights.
2. **Perception loop** — did the agent render, adjust, re-render? (Round-1's clearest
   process finding: every ≥2-render-with-adjustment session beat every single-render
   session; single-render sessions committed defects visible in the render they looked
   at.) Renders with no adjustment between are looking, not iterating.
3. **Lint etiquette** — errors fixed, not fought; the same lint re-fired > 3
   consecutive turns without a strategy change is a lint fight; warnings overridden
   **with a verbatim reason in the commit summary** is *good* process, silent override
   is not.
4. **Commit honesty** — the summary's claims match the diff and the render
   ("Rebalanced the board" over a diff that only spread one axis while 40% of the
   frame stayed empty is an inflated claim); honest declared limitations ("self-loop
   unsupported, used a badge") are credited.
5. **Economy** — ops proportionate to the ask; no thrashing (add-then-delete cycles);
   wall time within the session budget (15 min).

## Rubric

| score | anchor |
|---|---|
| 10 | Zero failed calls; render→adjust→render loop throughout; every warning override reasoned in the summary; summary matches diff exactly; proportionate ops. |
| 9 | v4 round-1 build class: zero failed calls, 6 renders interleaved with 6 op rounds, verbatim override notes, honest declared substitutions. |
| 8 | Clean run with minor friction — one or two failed calls immediately corrected, or one render-without-adjustment commit of an acceptable state. |
| 7 | A short lint skirmish or a mildly inflated summary line, otherwise clean. |
| 6 | Single-render commit of a state with a visible (but non-error) defect, or 3–5 failed calls, or one silently overridden warning. |
| 5 | Lint fight (same lint > 3 turns), or ops thrash (build-delete-rebuild), or summary claims a fix the diff doesn't show. |
| 4 | Committed a defect the agent *demonstrably saw* (named in thinking or visible in its own render) without declaring it — "giant paths, committed anyway" class. |
| 3 | Repeated syntax invention against the tool surface (old R10 class: `nudge=(-32,24)`, `offset=`, raw-coordinate guessing) even if eventually recovered. |
| 2 | Old-system first-session class: 12–23 consecutive rejected calls before first valid op; or an abandon caused by the agent's own earlier mess. |
| 1 | Wrecked commit pushed through, or dishonest summary about destroyed content. |

## Caps & overrides

- **Infra failures are not the agent's fault:** harness death (session stuck ACTIVE,
  transcript ending on a `render_draft` start), kernel container collisions, proxy
  deaths → the session is marked `INVALID(infra)`, retried once, and excluded from PH
  scoring. Do not launder infra flakiness into agent scores — but DO count it in the
  scorecard header's infra line; it tracks harness reliability over time.
- Honest refusals of an edit are credited here (and scored in IF), never punished.

## Output contract

Signal-by-signal findings (counts and the specific transcript moments — turn numbers,
verbatim summary lines for honesty calls), then the score.

## Notes

- PH dropping while output axes stay flat usually means a miscalibrated lint is making
  the same result cost more fighting (round 1's section-trim noise pattern) — say so
  in the findings when the transcripts show it.
