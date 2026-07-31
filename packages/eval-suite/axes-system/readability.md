# RD — Readability (1–10)
- code: RD
- scorecard-order: 3
- scored: per scenario (final committed state)
- roles: single judge

*Whether a fresh viewer can actually read the final committed board at arm's length.*

## Judge inputs

Sees: final-state PNG of the scenario board, the shared judge rules, this file.

Never sees: the brief, canvas JSON, transcripts, scenario configuration, other axes'
output, or the round-1 reports. There is no comparison or reference board; the board
is scored on its own against the anchors below.

## Method

Judge holistically, consulting these four sub-checks (they guide; they are not
separately scored):

1. **Corridors & air** — does every label chip own clear air; are the gaps between
   sequential stages wide enough to read at arm's length? (Ford's standing critique:
   "too close together if you're actually trying to read it.")
2. **Grouping** — can a viewer tell which nodes belong together
   without tracing edges? Tinted sections/regions must do real grouping work;
   grouping implied only by proximity fails this check. Each region must also read
   in one genre: either a system map (components — icons and stores — joined by
   standing relationships) or a procedure (steps and branches joined by
   then-edges, with a start and an end). Genres may mix freely across a board,
   and a crossover edge (a step writing to a store) is normal; but a single
   region that interleaves steps and components with no coherent reading
   direction forces the viewer to re-decide what its edges mean mid-read, and
   fails this check.
3. **Edge legibility** — crossings minimized and clean when unavoidable; no
   co-linear overlapping runs, no border-hugging marathons, no perimeter
   mega-detours forcing the eye to backtrack. An edge's meaning must also be
   readable from the line itself — label, arrowhead, line style; a relationship
   the viewer can only guess at (an unlabeled edge whose meaning is not obvious
   from its endpoints, an ambiguous or missing arrowhead on a directional flow)
   is illegible even when the line is drawn cleanly.
4. **Density & decomposition** — summed node area over painted board bounds, and how
   many nodes a section holds. A finished board lands near 15% ink with two or three
   nodes per section; air is the majority of a finished board. A board near 25% ink
   with sections routinely holding seven reads as one crowded frame however clean its
   topology.

## Rubric

Anchors are absolute — score the board against the descriptions, not against any
other board.

| score | anchor |
|---|---|
| 10 | Effortless beyond critique on every sub-check. Unclaimed; exists so 8–9 mean something. |
| 9 | Effortless at arm's length: every chip breathes, every edge traceable at a glance, groups read instantly, nothing a reviewer would change. |
| 8 | Fluent reading with one visible legibility flaw a reviewer would mention but not fix. |
| 7 | Comfortably readable: wide corridors, groups read without tracing, clean edges; a couple of tight spots or one awkward crossing slow the eye. |
| 6–6.5 | Readable with effort: corridors mostly wide but some chips touch edge traffic, one region packs too many nodes, or ink drifts toward 18–21% with sections holding four to six. |
| 5 | Parseable but packed or flat: no overlaps, yet ink around 25% with sections averaging seven nodes, uniform crowding, long detour edges — you can read it, slowly. |
| 4 | Reading is work: off-register rows, perimeter mega-detour edges dominate, crowding below ladder minimums in places — structure survives, fluency doesn't. |
| 3 | Systematically hard to read: overlapping anti-parallel edges reading as bidirectional, floating label rectangles near but not on their edges, crowding below ladder minimums throughout. |
| 2 | Multiple text-covering collisions, a self-loop drawn through its own box, content running outside the locked frame. |
| 1 | Wrecked: the layout communicates nothing. |

## Caps & overrides

None.

## Output contract

- The score.
- A **one-sentence rationale** tying the score to the anchor it lands on — a score
  without it is invalid.
- One short line per sub-check (four lines), flagging the failing ones.

## Notes

- Machinery that the agent declared as a substitution still counts against edge
  legibility where it obstructs reading — RD judges what a viewer sees, not the
  agent's honesty.
