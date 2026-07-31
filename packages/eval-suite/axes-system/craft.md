# CF — Craft (1–10)
- code: CF
- scorecard-order: 4
- scored: per scenario (final committed state)
- roles: single judge

*Whether the final committed board reads as a deliberately composed, finished
artifact — something you would pin up.*

## Judge inputs

Sees: final-state PNG of the scenario board, the shared judge rules, this file.

Never sees: the brief, canvas JSON, transcripts, scenario configuration, other axes'
output, or the round-1 reports. There is no comparison or reference board; the board
is scored on its own against the anchors below.

## Method

Judge holistically, consulting these four sub-checks (they guide; they are not
separately scored):

1. **Frame use** — is the content composed within the frame, or is a large fraction
   dead space with mass packed to one side? A board committed with the bottom ~40%
   of the locked frame empty fails this check.
2. **Color** — registry discipline, not decoration. Objects wear their registry
   preferred colors: teal for agent and orchestrator; pink for model and judge;
   blue for memory and knowledge; green for queue, send, and eval; yellow for
   human, message, event, key, and coin; red for guardrail; white for document and
   documents; gray for the infrastructure set (server, terminal, config, api,
   monitor, search, tool, wait, lock, activity, archive, package, voice) and the
   shape core. Consistency comes from the defaults; a departure reads deliberate
   only when it buys container legibility — and a direct child sharing its
   container's fill color is a flaw, never a justified departure. Decorative
   recoloring and monotone-by-neglect both fail; a registry-true restrained
   palette is NOT monotony.
3. **Machinery leakage** — junction crosshair marks, arrowheads terminating into
   waypoints, orphaned/floating badges, wires merging ambiguously. A finished board
   shows zero routing machinery.
4. **Alignment & rhythm** — registers hold across the board; density variation reads
   deliberate (hero row vs detail cluster) not accidental.

Vocabulary is part of craft, weighed through the anchors: a finished board speaks
the operational-map language — icons carry the nouns (agent, model, memory, tool,
queue, human, and the rest of the registry), the shape core carries the steps and
branches (process, predefined process, decision, ellipse, octagon). A plain labeled
box doing a job the registry has an object for, or a registry object used against
its meaning, reads as unfinished the same way off-register rows do.

## Rubric

Anchors are absolute — score the board against the descriptions, not against any
other board.

| score | anchor |
|---|---|
| 10 | Beyond critique on every sub-check. Unclaimed; exists so 8–9 mean something. |
| 9 | Exhibition grade: composed frame, registry-true color and vocabulary throughout, deliberate density variation, registers hold everywhere, zero machinery — nothing a reviewer would change. |
| 8 | Finished composition with one visible flaw a reviewer would mention but not fix. |
| 7 | Composed: the frame is filled with intent, objects wear their registry colors with only justified departures, registers mostly hold, no machinery; slight imbalance (one large empty band) or a couple of vocabulary misses keeps it under 8. |
| 6–6.5 | Breathes but doesn't finish: machinery leaks (crosshair junctions, a floating unanchored badge) or a dead band of frame, against otherwise deliberate composition. |
| 5 | Flat: clean topology but the vocabulary is ignored — plain boxes where the registry has objects for the job, monotone-by-neglect or decorative off-registry color, uniform density — nothing composed. You can read it; you wouldn't pin it up. |
| 4 | Composition fails: stretched empty section towers, mass packed to one side with large dead frame, off-register rows dominate. |
| 3 | Decorative noise, contradictory color semantics, or registry objects used against their meaning; machinery throughout; composition reads accidental. |
| 2 | Content off the locked frame; boxes piled with no compositional intent. |
| 1 | Wrecked: no discernible composition at all. |

## Caps & overrides

None.

## Output contract

- The score.
- A **one-sentence rationale** tying the score to the anchor it lands on — a score
  without it is invalid.
- One short line per sub-check (four lines), flagging the failing ones.

## Notes

- Machinery that the agent declared as a substitution still counts here — CF judges
  the artifact's looks, not the agent's honesty.
