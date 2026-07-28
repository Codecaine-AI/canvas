# PH — Process Health (1–10)
- code: PH
- scorecard-order: 6
- scored: per scenario (all sessions in the arc)
- roles: single checker

*Was the session mechanically clean and honest? Graded from the kernel transcript.*

## Judge inputs

Sees: transcripts for every session in the scenario
(`GET :4820/api/agent/kernel/sessions/:containerId/transcript`), session metadata
(retries, timings), commit summaries, the stage diffs (to audit summary honesty),
the shared judge rules, this file.

Never sees: reference boards. PH does not judge how the board looks.

## Method

Work the signals in scoring order:

1. **Failed calls & retries** — failure rate, longest failure run, and repeated
   error classes, judged against the definitions below. A NO-OP is not a failure.
2. **Perception loop** — the current board render arrives with every
   `<state>` block, refreshed on every draft write, so whole-board awareness
   is standing, not requested. `look` is the close-up: it frames exactly one
   region (`view` a section or single object, `at` a rect) and returns it
   rendered and measured. The loop to credit is edit → read the refreshed
   board → adjust what it shows, with framed `look`s spent where the board
   is too dense to judge at full scale — during build on the region just
   worked, and during QA. The pathology is un-read renders: a defect that
   sits visible in the standing board image for a stretch of turns and is
   never addressed is looking-free editing even though pixels were
   delivered every turn. Consecutive framed `look`s with no adjustment
   between are looking, not iterating. A bare or both-knobs `look` is
   refused by the tool; sending one again after the refusal named the two
   legal calls counts as a repeated error class.
3. **Lint etiquette** — errors fixed, not fought; the same lint re-fired > 3
   consecutive turns without a strategy change is a lint fight; warnings overridden
   **with a verbatim reason in the commit summary** is *good* process, silent override
   is not.
4. **Commit honesty** — the summary's claims match the diff and the render
   ("Rebalanced the board" over a diff that only spread one axis while 40% of the
   frame stayed empty is an inflated claim); honest declared limitations ("self-loop
   unsupported, used a badge") are credited.
5. **Economy** — ops proportionate to the ask; no thrashing (add-then-delete cycles);
   a repeated NO-OP on a target whose note has already been read is thrash; wall
   time stays within the session budget (15 min), and the 300-turn budget is not
   exhausted without reaching `finalize`.

### What counts as a failed call

**A failed call** is any tool call that returns an ERROR result. This includes
runtime schema-validation errors (a missing or malformed field; an off-roster
color, type, glyph, anchor, or arrow value; a malformed id; or incomplete or
non-finite geometry) and state-validation errors (an id that is not on the
board, an id of the wrong kind, a duplicate id, an edge whose endpoints are the
same object, or removing the last section), plus rejected `resolve_request` and
blocked `finalize` calls.

**A NO-OP is not a failed call.** `NO-OP` means the request was well formed and
legal and there was nothing to do. It never counts in any failure count, ratio,
or run length. A repeated NO-OP on the same target after its note has already
been returned is thrash and is scored under Economy, not as failure.

**A warning carried under an APPLIED line is not a failed call.** The operation
applied.

- **Failure rate** = failed calls ÷ total tool calls in the session.
- **Failure run** = the longest sequence of consecutive failed calls with no
  APPLIED result between them.
- **Repeated error class** = the same error, on the same field or the same kind
  of target, recurring in a later call after the error text already named it.
  The schema declares the shape, so guessing at it again after being told is the
  pathology this axis is most sensitive to.

## Rubric

| score | anchor |
|---|---|
| 10 | Zero failed calls; adjustments track what the standing board render shows throughout, with framed close-ups accompanying dense-region work; every warning override reasoned in the summary; summary matches the diff exactly; operations proportionate to the ask. |
| 9 | Failure rate under 1%; every failure corrected on the next call; no repeated error class; close-up `look`s interleaved with detail work; verbatim override notes; honest declared substitutions. |
| 8 | Failure rate under 3%, longest failure run ≤ 2, and no repeated error class; or one commit of an acceptable state with no framed `look` during QA. |
| 7 | A short lint skirmish or a mildly inflated summary line, otherwise clean. |
| 6 | Failure rate 3–8%; or one error class repeated after it was named; or a commit with a visible non-error defect the standing render had shown for several turns; or one silently overridden warning. |
| 5 | Longest failure run ≥ 3; or failure rate 8–15%; or a lint fight (the same lint re-firing > 3 consecutive turns with no strategy change); or operation thrash (build-delete-rebuild); or a summary claiming a fix the diff does not show. |
| 4 | Committed a defect the agent demonstrably saw — named in its thinking, standing in the board render across turns, or shown by a close-up it called for — without declaring it. |
| 3 | One error class repeated ≥ 5 times across the session, or failure rate above 15%; the schema declares every field, so re-guessing a shape the error text already corrected is the clearest flail signal this surface produces. Dense-region work with no framed `look` anywhere, or defects standing un-addressed in the board render for most of the session, also land here. |
| 2 | At least 5 consecutive failed calls before the first APPLIED result; or failure rate above 25%; or the turn budget exhausted without reaching `finalize`; or an abandon caused by the agent's own earlier mess. |
| 1 | Wrecked commit pushed through, or dishonest summary about destroyed content. |

Rates are computed over all tool calls in the session, including `look`,
`resolve_request`, and `finalize`, so a long healthy session is not punished for
its length.

## Caps & overrides

- **Infra failures are not the agent's fault:** harness death (session stuck ACTIVE,
  transcript ending on a tool start), kernel container collisions, proxy
  deaths → the session is marked `INVALID(infra)`, retried once, and excluded from PH
  scoring. Do not launder infra flakiness into agent scores — but DO count it in the
  scorecard header's infra line; it tracks harness reliability over time.
- Honest refusals of an edit are credited here (and scored in IF), never punished.

## Output contract

Signal-by-signal findings (counts and the specific transcript moments — turn numbers,
verbatim summary lines for honesty calls), then the score.

## Notes

- PH dropping while output axes stay flat usually means a miscalibrated lint is making
  the same result cost more fighting — say so in the findings when the transcripts
  show it.
