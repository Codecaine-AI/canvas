---
name: canvas
description: "Draw and edit Codecaine Canvas boards through the
  codecaine-canvas MCP: system architecture, flow and pipeline diagrams,
  state charts and ownership maps. Use after the instruments skill
  routes a diagram to canvas, when Ford says canvas or board, or before
  any place_*, connect or look call."
compatibility: "Needs the codecaine-canvas MCP server."
metadata: { version: "0.1.0", product: canvas }
---

# Canvas

A board is a typed JSON file at `canvases/<id>.canvas.json`. The MCP is
the only write path for agents. Every edit saves at once and returns a
delta and lint changes. The instruments skill decides whether a
subject is a canvas at all. This skill says how to draw one.

## Workflow

The phases come from the layout editor's prompt, preserved in
`references/operating-context.md`. Its phases 1 and 2 merge into
Understand here.

1. Understand. Compare `snapshot.json` with the snapshot id that
   `canvas_guidance` returns, and regenerate the skill if they differ.
   Read the request and the board digest. Research the subject until
   you can name every actor, store and boundary. Map each concept to a
   visual pattern, plan the visual flow, and write the drawing plan as
   sections before you place anything.
2. Build. Place one section at a time: frame, objects, names, edges.
   Call `look` on the section, audit it against the plan, check
   visual defects and lints, fix, and look again. Adapt the plan when
   the board teaches you something.
3. Finish. `look` at each section in turn, because `look` frames one
   region and not the whole board. Apply the quality checklist:
   depth and evidence, conceptual clarity, container discipline,
   structure, technical accuracy, visual validation. Call
   `canvas_check`, read its whole-board PNG, and fix every error
   before you call it done.

## Rules

- Color encodes kind, never decoration. Never change the workspace theme.
- A name is 5 words or fewer. A detail is one fact of 48 characters or
  fewer. Explanations go on a sticky.
- Geometry lands on a 20 unit grid. A flow node is 280 by 100. Gaps are
  140 across a row and 100 down a column.
- A dashed edge means planned or optional. A solid edge exists.
- Apply the prompt's two tests. Isomorphism: every box and wire maps to
  one real thing. Education: a newcomer learns the system from the
  board alone.

## References

- `references/operating-context.md` holds the full layout-editor
  prompt, the state grammar and the aesthetic topic.
- `references/diagram-design.md` says how a diagram reads.
- `references/visual-patterns.md` lists the nine patterns.
- `references/vocabulary.md` lists 103 object kinds in 10 groups with
  their preferred colors.
- `references/colors.md` lists the 10 colors and what each one means.
- `references/conventions.md` covers ids, text limits, containment and
  the grid.
- `assets/contact-sheet.png` renders every glyph in the default style.
