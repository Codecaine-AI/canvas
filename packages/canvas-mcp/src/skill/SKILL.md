---
name: canvas
description: "Draw and edit Codecaine Canvas boards through the
  codecaine-canvas MCP: system architecture, flow and pipeline diagrams,
  state charts and ownership maps. Use after the instruments skill
  routes a diagram to canvas, when Ford says canvas or board, or before
  any place_*, connect or look call."
compatibility: "Needs the codecaine-canvas MCP server."
metadata:
  version: "0.1.0"
  product: canvas
---

# Canvas

A board is a typed JSON file at `canvases/<id>.canvas.json`. The MCP is
the only write path for agents. Every edit saves at once and returns a
delta and lint changes. The instruments skill decides whether a
subject is a canvas at all. This skill says how to draw one.

## Workflow

1. Understand. Compare `snapshot.json` with the snapshot id that
   `canvas_guidance` returns, and regenerate the skill if they differ.
   Read the request and the board digest. Research the subject until
   you can name every actor, store and boundary. Map each concept to a
   visual pattern, and write the plan before you place anything: the
   sections in rows, each section's nodes as rows, the color key, and
   every wire.
2. Build. Place everything, then connect. `place_section` for every
   section with its title, icon and color. `place_shape` for every
   node inside its section with its name, detail and color.
   `arrange_section` for every section with its node rows, then
   `space_out` the sections. Then `connect` every wire and call
   `tighten_wires` once.
3. Finish. Call `canvas_check`, read its whole-board PNG, and `look` at
   any section whose text you cannot read in it. Fix every error
   before you call it done.

## Rules

- Color encodes kind, never decoration. Give each section and node its
  role's hue. Never change the workspace theme.
- A name is 5 words or fewer. A node's detail is one fact of 48
  characters or fewer. A section has a title only, no detail.
  Explanations go on a sticky.
- Label a wire only for a condition, a branch or a payload.
- Geometry lands on a 20 unit grid. A flow node is 280 by 100.
  `arrange_section` sets the gaps: 200 across a row and 100 down a
  column.
- A dashed edge means planned or optional. A solid edge exists.
- Every box and wire maps to one real thing in the source.

## References

- `references/operating-context.md` holds the state grammar that
  reads tool results, and the aesthetic topic.
- `references/diagram-design.md` says how a diagram reads.
- `references/visual-patterns.md` lists the ten patterns.
- `references/vocabulary.md` lists 103 object kinds in 10 groups with
  their preferred colors.
- `references/colors.md` lists the 10 colors and what each one means.
- `references/conventions.md` covers ids, text limits, containment and
  the grid.
- `assets/contact-sheet.png` renders every glyph in the default style.
