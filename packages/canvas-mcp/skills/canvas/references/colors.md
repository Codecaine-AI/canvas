<!-- Generated from packages/canvas/src/authoring/vocabulary.ts (sha256 4e19a0af7e0eb661c5f38ad20ec2bad2ddabd555070589731550ddf02be97d0b). Do not edit. Regenerate with `bun packages/canvas-mcp/src/cli.ts guidance --write`. -->

# Color Palette

gray, red, orange, yellow, green, teal, blue, violet, pink, white

<color_meaning>
    Color encodes kind, not decoration. Give each kind of thing one hue, such as one for every data store and another for every agent.

    - Before you place nodes, write the board's color key: three to five roles, one hue each. Give each section the hue of the role it holds.
    - Give each section a hue that differs from its parent's and from every sibling section's, so a viewer sees where each group starts and ends. Siblings repeat a hue only when the palette runs out, and never two that face each other.
    - A node takes its role's hue, whatever its icon. Use the preferred color a catalog entry lists only when its role has no hue in the key, so two nodes with different roles never share a hue by accident.
    - Red means failure, reject, or error, and nothing else.
    - When a viewer cannot guess the key from the names, put it on the board as a short note, one line per hue. A key that is only in the board description is invisible.
</color_meaning>

<theme>
    The visual theme (figjam, schematic-light, schematic-dark) is a workspace setting a person picks in Studio, stored in canvases/canvas-style.json. It decides how each roster color renders. Never change the theme, and never design for a single theme: the same board renders in every theme.
</theme>
