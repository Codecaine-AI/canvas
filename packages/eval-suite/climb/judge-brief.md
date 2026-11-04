# Judge brief: score Canvas diagram boards

You score diagram boards that an agent drew from written briefs. Each board is one PNG. Score each board on its own, in 9 categories, from 1 to 10. Then list the findings that cost the board the most points.

## What you see

For each board you get two things, and nothing else:

- **The brief**: `packages/eval-suite/scenarios-system/<brief>/brief.md`. It describes the system the board must show.
- **The PNG**: `packages/eval-suite/runs/climb/round-<n>/<brief>/board.png`. It is the whole board as the drawer left it.

Do not open any other file in the round folder. Do not read the board JSON, the transcript, the metrics, other rounds, other judges' scores or any reference image. There is no reference board. Score what the PNG shows against the anchors below.

## How to score

- Give every category a whole number from 1 to 10.
- Use the anchors. A score between two anchors means the board sits between them.
- Score each category on its own evidence. A fault that hurts two categories can lower both.
- Judge only what a viewer of the PNG can see. A fact that is in the brief but not readable on the board is missing.
- Do not round up for effort, size or ambition. A small board that is right beats a large board that is wrong.

## Categories

### Meaning: needs the brief

**System fidelity** (`system_fidelity`): the board says what the system does, with no wrong facts. Rebuild the system from the board alone, then compare it with the brief.

- 1-2: The board shows a different system, or most links are wrong.
- 3-4: The main flow is there, but several parts, directions or failure paths are wrong.
- 5-6: The system is recognisable. One important part or path is wrong or unclear.
- 7-8: The system is right. Small facts are vague, or one minor link is wrong.
- 9-10: A reader rebuilds the brief's system from the board, with no wrong facts.

**Requirement coverage** (`requirement_coverage`): every requirement in the brief is on the board. Split the brief into its separate requirements, then find each one on the board.

- 1-2: Most requirements are absent.
- 3-4: The main flow is there, but many requirements are absent.
- 5-6: Most requirements are there. Some key ones, such as a failure path, are absent.
- 7-8: Every key requirement is there. A few supporting details are absent or partial.
- 9-10: Every requirement is on the board and readable.

**Scope discipline** (`scope_discipline`): the board adds nothing the brief does not ask for.

- 1-2: Invented parts or flows crowd out the brief's system.
- 3-4: Several invented parts, flows or claims.
- 5-6: One invented part or flow, or padding text that says nothing.
- 7-8: Small extras, such as a note that repeats the brief, with no invented facts.
- 9-10: Everything on the board comes from the brief.

### Look: needs only the PNG

**Readability** (`readability`): a new viewer can read the board at arm's length.

- 1-2: Most text is too small, overlapped or hidden.
- 3-4: The viewer must zoom or guess to read large parts.
- 5-6: Readable with effort. Crowded areas or unclear edges slow the viewer.
- 7-8: Easy to read. One or two crowded spots.
- 9-10: Every label and edge reads at a glance, with clear air around each.

**Hierarchy & grouping** (`hierarchy_grouping`): sections and sizes show what matters first.

- 1-2: No grouping. Every element has the same weight.
- 3-4: Groups exist but do not match the system's parts.
- 5-6: Groups match the system, but the main path does not stand out.
- 7-8: Clear groups and a clear main path. One group is too big, too small or misplaced.
- 9-10: The viewer sees the main parts first, then the detail, in the right order.

**Layout & flow** (`layout_flow`): the direction is clear, and wires are short and do not cross.

- 1-2: No direction. Wires tangle across the board.
- 3-4: A direction exists, but long detours and many crossings break it.
- 5-6: One main direction. Several crossings, back-tracks or long wires.
- 7-8: Clean flow. One or two crossings or long wires.
- 9-10: One clear direction, short straight wires, and no needless crossing.

**Color & contrast** (`color_contrast`): color carries meaning, and text stays legible.

- 1-2: Color is random, or text is hard to read on its fill.
- 3-4: Color is mostly decoration. Some text has poor contrast.
- 5-6: Color follows a scheme, but its meaning is unclear, or it is overused.
- 7-8: Color carries meaning that a viewer can learn. One weak contrast.
- 9-10: Every color means one thing, the viewer learns it fast, and all text has strong contrast.

**Typography & labels** (`typography_labels`): names are short, sizes are steady, and no text is clipped.

- 1-2: Text is clipped, overflowing or unreadable.
- 3-4: Long sentence labels, mixed sizes, or several clipped labels.
- 5-6: Mostly short names. Some long labels or uneven sizes.
- 7-8: Short names and steady sizes. One long or awkward label.
- 9-10: Every name is short and clear, sizes follow the hierarchy, and nothing is clipped.

**Craft** (`craft`): the board looks finished, ready to pin up.

- 1-2: A draft. Overlaps, stray elements and broken wires.
- 3-4: Unfinished. Uneven spacing and misaligned elements throughout.
- 5-6: Mostly tidy. Several visible rough edges.
- 7-8: Tidy and aligned. One or two rough edges.
- 9-10: Composed and consistent. Nothing to fix before pinning it up.

## Findings

For each board, list up to 5 findings, worst first. A finding is one sentence. It names the category, the place on the board and the fault, for example "Layout & flow: the fallback wire from Router crosses the cache section twice." Name only faults you can see in the PNG or check against the brief.

## Score file

Write one JSON file for the round: `packages/eval-suite/runs/climb/round-<n>/scores/<judge>.json`, where `<judge>` is your judge id (`sol`, `opus`, `muse`, `fable` or `gemini`). It holds every board you scored in that round. Write nothing else in the file.

```json
{
  "judge": "sol",
  "round": 1,
  "boards": [
    {
      "brief": "ivr-agent-handoff",
      "scores": {
        "system_fidelity": 7,
        "requirement_coverage": 6,
        "scope_discipline": 8,
        "readability": 7,
        "hierarchy_grouping": 6,
        "layout_flow": 5,
        "color_contrast": 7,
        "typography_labels": 8,
        "craft": 6
      },
      "findings": [
        { "category": "layout_flow", "finding": "The callback wire from the human queue loops around the whole board." }
      ]
    }
  ]
}
```

- `judge`: your judge id, the same as the file name.
- `round`: the round number, the same as the folder `round-<n>`.
- `boards`: one entry per board you scored, each brief once.
- `brief`: the brief id, the folder name under `round-<n>/`.
- `scores`: all 9 keys, each a whole number from 1 to 10.
- `findings`: up to 5 entries, worst first. `category` is one of the 9 score keys.
