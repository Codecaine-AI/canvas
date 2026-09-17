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
   dead space with mass packed to one side? Purposeful whitespace separates regions and exposes the flow; unexplained empty bands do not.
2. **Color** — consistent meaning and legibility. Registry colors are starting
   defaults: teal for agent and orchestrator; pink for model and judge;
   blue for memory and knowledge; green for queue, send, and eval; yellow for
   human, message, event, key, and coin; red for guardrail; white for document and
   documents; gray for the infrastructure set (server, terminal, config, api,
   monitor, search, tool, wait, lock, activity, archive, package, voice) and the
   shape core. Gray is not mandatory: process and decision tints can express
   consistent roles or functions. Judge whether color communicates that meaning
   and preserves legibility. A child may share
   its container's hue if its text, border, and fill remain visually distinct. Decorative
   recoloring and monotone-by-neglect both fail; a registry-true restrained
   palette is NOT monotony.
3. **Machinery leakage** — junction crosshair marks, arrowheads terminating into
   waypoints, orphaned/floating badges, wires merging ambiguously. A finished board
   shows zero routing machinery.
4. **Alignment & rhythm** — real peers share local registers, sizes, and gaps;
   unrelated regions have proportions suited to their role. Grouping and hierarchy
   make the main flow visible. Repeated identical panels with one icon and a long
   note each are weak composition when their text describes a richer structure.
   Notes can retain depth without substituting for drawable relationships.

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
| 9 | Exhibition grade: composed frame, semantically consistent color and vocabulary throughout, deliberate density variation, registers hold everywhere, zero machinery — nothing a reviewer would change. |
| 8 | Finished composition with one visible flaw a reviewer would mention but not fix. |
| 7 | Composed: the frame is filled with intent, objects use color consistently for meaning and legibility, registers mostly hold, no machinery; slight imbalance (one large empty band) or a couple of vocabulary misses keeps it under 8. |
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
