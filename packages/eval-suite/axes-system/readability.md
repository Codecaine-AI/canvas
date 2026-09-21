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
2. **Grouping** — can a viewer tell which participants belong together and why?
   Regions should express ownership, function, or a coherent stage. Position and
   proximity can group page-level entries or shared context without a frame.
   A system map and a procedure may share a region when the edge meanings and
   reading direction stay clear. Equal panels are useful only for true peers.
3. **Edge legibility** — crossings minimized and clean when unavoidable; no
   co-linear overlapping runs, no border-hugging marathons, no perimeter
   mega-detours forcing the eye to backtrack. An edge's meaning must also be
   readable from the line itself — label, arrowhead, line style; a relationship
   the viewer can only guess at (an unlabeled edge whose meaning is not obvious
   from its endpoints, an ambiguous or missing arrowhead on a directional flow)
   is illegible even when the line is drawn cleanly.
4. **Density & decomposition** — can the viewer discern the main flow, hierarchy,
   parallel paths, shared state, decisions, and failure or recovery paths that the
   board itself describes? Region sizes should follow their contents and roles.
   Notes can carry rationale, constraints, examples, and operational detail, but
   should not require the viewer to reconstruct the central topology from prose.
   A uniform panel grid with one icon and a long note per panel can be complete
   yet communicate little visually. Judge that failure here, without requiring
   every board to contain concurrency, stores, or failures. Do not infer missing
   requirements from an unseen brief. There is no ink-percentage target or
   nodes-per-section quota; judge actual legibility and useful decomposition.

## Rubric

Anchors are absolute — score the board against the descriptions, not against any
other board.

| score | anchor |
|---|---|
| 10 | Effortless beyond critique on every sub-check. Unclaimed; exists so 8–9 mean something. |
| 9 | Effortless at arm's length: every chip breathes, every edge traceable at a glance, groups read instantly, nothing a reviewer would change. |
| 8 | Fluent reading with one visible legibility flaw a reviewer would mention but not fix. |
| 7 | Comfortably readable: wide corridors, groups read without tracing, clean edges; a couple of tight spots or one awkward crossing slow the eye. |
| 6–6.5 | Readable with effort: some chips touch edge traffic, or hierarchy and branching take close reading to recover. |
| 5 | Parseable but packed or flat: no overlaps, yet uniform panels or long notes conceal the central flow, shared state, or branch structure; long detours or crowding slow reading. |
| 4 | Reading is work: off-register rows, perimeter mega-detour edges dominate, insufficient clearance around text or routes in places — structure survives, fluency doesn't. |
| 3 | Systematically hard to read: overlapping anti-parallel edges reading as bidirectional, floating label rectangles near but not on their edges, insufficient clearance around text and routes throughout. |
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
