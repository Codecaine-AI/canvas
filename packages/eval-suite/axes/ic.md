# IC — Information Comprehension (1–10)
- code: IC
- scorecard-order: 2
- scored: per scenario (final committed state)
- roles: blind judge + scorer (two separate sessions)

*Does the render actually transmit the content? Measured by blind reconstruction.*

## Judge inputs

**Blind judge** — Sees: the final PNG ONLY, served under an anonymized name
(`board.png`; filenames leak genre — dry-run finding). Its prompt carries no scenario
vocabulary. Never sees: the instruction, the fixture, genre hints, canvas JSON, this
suite's other files, anything else from the run.

**Scorer** — Sees: the blind judge's reconstruction, the fixture's comprehension key,
the final canvas JSON (for corruption checks), `axes/README.md`, this file. Never sees:
reference boards, other axes' output.

## Method

The blind judge produces a structured reconstruction:

```
TOPIC: one sentence — what this board is about
NODES: every box/entity it can read, verbatim labels
EDGES: directed relationships as "A → B (label)" incl. style meaning if inferable
GROUPS: which nodes belong together, and what each group represents
ORDER: the flow narrative — where a reader starts, the main path, branches, loops
CONVENTIONS: what dashed/colors/shapes appear to mean
UNCERTAIN: anything it can see but cannot confidently interpret
```

The scorer compares the reconstruction against the fixture's **comprehension key** —
facts split into CORE (weight 2) and SECONDARY (weight 1):

- A fact is **recovered** if the reconstruction states it substantively (paraphrase
  fine; direction and endpoints must be right).
- A fact recovered only with an explicit hedge — listed in UNCERTAIN, or asserted as
  "best reading / inferred from proximity / could be swapped" — counts **0.5**: the
  board made the reader work for it, and half-credit is what separates strenuous
  inference from communication (dry-run finding, 2026-07-22).
- A fact is **corrupted** if the reconstruction asserts a relationship the board's
  ground truth contradicts (wrong direction, wrong endpoints, invented edge, nodes
  assigned to the wrong group).

Compute **R** = weighted recovered / weighted total; **C** = count of corrupted facts.

## Rubric

R and C gate together; take the lowest row you qualify for:

| score | requirement |
|---|---|
| 10 | R = 1.0, C = 0. A blind reader rebuilt the whole spec from the picture. |
| 9 | R ≥ 0.95, C = 0. |
| 8 | R ≥ 0.90, C = 0 — all CORE facts recovered, only secondary detail lost. |
| 7 | R ≥ 0.85, C ≤ 1, every CORE fact recovered. |
| 6 | R ≥ 0.75, C ≤ 2 — the narrative and groupings survive; some relations lost. |
| 5 | R ≥ 0.65, C ≤ 3 — main path recoverable, branches/loops degrade. |
| 4 | R ≥ 0.50 — topic and rough structure only; or C ≤ 5 with better recall. |
| 3 | R ≥ 0.35 — reader gets the domain and a few relations. |
| 2 | Topic recoverable, structure not. |
| 1 | Reconstruction fails or contradicts the board wholesale. |

The "every CORE fact recovered" qualifiers on the 7–8 rows mean recovered **unhedged**
— CORE facts surviving only as inference drop the board out of those rows even when R
clears the threshold (dry-run: nested-arch, R 0.90, scored 6.5).

## Caps & overrides

- Any corrupted **CORE** fact caps IC at **6** regardless of R — a diagram that
  misleads about a core relationship is worse than one that omits it.

## Output contract

**Blind judge:** the full structured reconstruction, exhaustive UNCERTAIN section
included — ambiguity findings are as valuable as recoveries; report only what the
picture supports, and put ambiguous attributions in UNCERTAIN rather than guessing.

**Scorer:** R, C, the score, and a per-fact table (recovered / hedged / missed /
corrupted, with the reconstruction line that settles each call).

## Notes

- IC is deliberately independent of SQ: an ugly-but-lucid board can score IC 9 / SQ 5;
  a gorgeous board whose junction glyphs read as dead-ends can score SQ 7 / IC 5. If
  the two track each other run over run, one has collapsed into the other (shared
  discrimination rule).
- Dry-run evidence (2026-07-22): zero corruptions across all five v4 boards — v4 fails
  by ambiguity, not misdirection; the old system's anti-parallel overlaps are the
  corruption class the C gate exists for. The hedge rule is what surfaced the
  state-machine's junction tax (IC 6.5 vs the flowchart's 10).
