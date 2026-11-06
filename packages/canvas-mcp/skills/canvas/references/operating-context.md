<!-- Generated from packages/canvas/src/authoring/state-grammar.ts (sha256 44eab1222c133465561eda9f840a29a4a3cdb3a1c17dc934b8d37189828a4d42), packages/canvas/src/authoring/style-guide/aesthetic.ts (sha256 3b9d417e22ed340888c59a17095e46a4fa238dc09e295372c45afaa51d1cac18). Do not edit. Regenerate with `bun packages/canvas-mcp/src/cli.ts guidance --write`. -->

# Operating Context

The reading key for MCP results, and the house style.

- `canvas_open` returns the board digest and lints, every edit returns its delta and lint changes,
  and `look` renders one region. The state grammar says how to read them.
- The aesthetic topic is the house style.

## State Grammar

<state_grammar>
    How board state reads. This is the key, one entry per block.

    - The <state> block and every tool result carry bare values in a fixed grammar.
    - Counts ride as attributes on the blocks themselves.
    - An empty block is a self-closing tag.

    <board>
        - object line: id type "text" [color] x,y w×h [k=v…]
            - indentation is containment
            - the tree runs the base section, then each section's contents
        - elided defaults: color gray (sticky yellow) · edge solid gray arrow=forward · shape per type
        - object extras appear only when set:
            - icon= (a section's header glyph; an icon object's glyph is its type)
            - detail= (the one-line fact under the name)
            - locked=
            - shape=
            - layout=mode,pad=,gap=
            - dir=
            - author= (who placed it)
        - edge line: id from→to "label" [extras] · route
            - extras when set:
                - dashed
                - a color
                - arrow=
                - anchors=a→b
                - pos=
                - wp=
                - lp=along[@offset] (the label chip's pin)
        - edge route after ·: ─(sN h y=…)→ horizontal · (sN v x=…) vertical · sN = shift_segment index
        - segment indices are never renumbered
            - take the sN for a shift from the newest printing of that edge, never an older one
        - text is never truncated
            - whitespace collapses to single spaces, but every word is there
        - <description> is the board's own markdown account
            - the board shows what is there, the description says what it means
            - update_description replaces it
            - set_board_title renames the board
        - annotation threads never appear in the digest
            - they are the <requests> queue
    </board>

    <recent_ops>
        - one line per call this run, newest last: tN tool target detail
            - the durable ledger
            - NO-OP and ERROR calls are marked as such
    </recent_ops>

    <diff>
        - the cumulative base→draft change, one line per changed entity:
            - addSection id · updateObject id  moved · recolored · … · removeConnection id
        - built from the exact edits a committed finalize proposes
            - it always equals what committing would ship
    </diff>

    <lints>
        - one open finding per line:
            - grouped under <errors>, <warnings> and <notes>
            - recomputed every request
            - E1 rule: what is wrong and where (a suggested fix)
        - ids are stable only until the draft changes, then they reassign from E1/W1
        - always-on rules: covered-content
        - every open E* in your edited scope blocks a committed finalize
            - the finding names the problem, the fix is yours to choose
        - W* warnings and N* notes never block: they ride along in the proposal
        - overlap is the only check: a box on a box, or a section on a section
            - wire routes, label chips, text fit, and section fit are automatic
            - canvas_check counts label chips that found no clear spot under LAYOUT, never as a finding
    </lints>

    <requests>
        - the operator's annotation threads, one line each:
            - Rn open target author — "body"
            - replies indented as ↳ author — "reply"
            - Rn done|declined "note" once disposed
        - answer a thread by editing board content, then dispose it with resolve_request
            - the disposal note is what the operator sees
    </requests>

    <views>
        - names the attached images in order:
            - (1) the board as it stands now
            - then up to three prior change renders, newest first, each captioned with the gesture that made it
        - a failed current-board render is reported here and the previous render is kept
    </views>

    <recent_conversation>
        - the capped tail of the run's messages
            - the <state> block above it always carries the current picture
            - <recent_ops> carries the durable history
    </recent_conversation>

    <results>
        - APPLIED · gesture target geometry
            - the headline of a call that changed the draft
            - the numbers are the ones that landed after the grid snap, so plan the next gesture from them
            - an indented note beneath is report-only, the edit still landed
        - DELTA
            - what the call changed:
                - + id … added
                - − id removed
                - id x,y → x,y moved
                - id x,y w×h → … resized
                - id field before → after
                - route a→b → c→d repointed
                - anchors|pos|wp … → … steered
        - LINTS · +new −resolved
            - the findings the call opened, each in prose, and the ids it resolved
            - · +0 −0 (n open) when nothing changed
            - · clean when nothing is open either
        - ROUTES
            - the routed truth for every wire the call touched:
            - id anchors a→b path A ─(s0 h y=…)→ … B through none|ids
            - a clean wire crosses nothing, so aim for through none
        - REQUESTS · none | k/n disposed
            - the queue after a request-touching call
        - NO-OP · …
            - the call was legal and there was nothing to do
        - ERROR · …
            - the call was not legal
            - read the line, fix the call, send it again
        - a result is sized to its operation
            - the standing picture is never restated there, because the next <state> block carries it
    </results>

    <look>
        - LOOK · n renders [· close-up id] [· framed label]
            - then the standing truth in one result:
                - the flat digest (BOARD, then EDGES, same line grammar as <board>)
                - BOARD DIFF
                - DIAGNOSTICS · n errors · m warnings [· k notes] (the full recount)
                - ROUTES for every edge
                - REQUESTS
                - MEASURES for each framed region
        - MEASURES · region x,y w×h
            - gaps x|y: the clear corridor between each neighbouring pair, named by the two ids
            - pitch x|y: the row/column repeat
            - free: a frame's unused margins per side
            - ink: the share of the region its boxes paint
        - spacing is read off MEASURES rows, not derived from digest coordinates
    </look>
</state_grammar>

## Aesthetic

<style_guide>
    The house style preferences: deliberate defaults for visual judgment, not laws.

    <aesthetic>
        Let the system determine the composition.

        - Sketch regions for actors, ownership, stages, shared stores, and loops before filling details.
        - Give regions variable sizes and proportions according to their role, contents, and connections.
        - Match sizes and gaps among real peers locally; unrelated regions need not share a register or a rectangle.
        - Give node labels, edge labels, and branch points readable local clearance; enlarge or reposition a cluster instead of scaling its labels down.
        - Use the craft targets as starting points, adjusting spacing for actual labels and routes.
        - Work in 20px grid units and reuse exact peer geometry rather than near-miss estimates.
        - Leave purposeful whitespace between groups and around labels; reserve wider corridors where wires actually pass.
        - After the main graph exists, move and resize provisional regions and change the page aspect ratio around its routes; avoid preserving equal bands and appending rows.
        - Sections name useful ownership or functional groups and remain individually addressable.
        - Section count follows meaning, with no fixed node quota; page-level entries, shared context, and notes are appropriate when they concern the whole board.
        - Outline first, recompose after the main graph, and crop the outer page only after paths and labels are readable.
        - Establish semantic types for participants, actions, decisions, stores, and artifacts before repetition; clone only correctly typed semantic peers.
        - Stickies carry rationale, constraints, examples, and operational detail beside that structure; there is no required note per section.
        - Use tinted regions to distinguish meaningful roles or ownership families, reusing color for the same meaning; avoid one gray template or a rainbow of unrelated stage colors.
        - Use registry colors as starting points; process and decision tints may express consistent roles or functions, and gray is a fallback rather than a mandate.
        - Check actual text, border, and fill contrast in the render; a child may share its region's hue when it remains distinct and readable.
        - Place closely related regions near each other and align directly connected endpoints on a common axis across region boundaries before wiring, so main runs can be straight.
        - For parallel work, arrange participants across the main direction and connect the actual participants through visible fan-out and merge; a wire into their section alone does not show their individual work.
        - Place shared stores and feedback destinations near their consumers, with notes beside the subject outside the flow corridors.
        - Fix unnecessary elbows and long detours by moving objects or regions and clearing obstructions before adding route steering.
        - Keep bends where branches or feedback need them; choose direction from the subject rather than forcing every diagram into a linear sequence.
        - Make important arrows identify producer, recipient, payload or trigger, and direction through their endpoints, labels, and arrowheads; notes cannot replace a causal handoff.
        - Trace applicable normal, failure, and feedback paths separately without notes; recompose implied or misleading handoffs and check explicit store and control relationships.
    </aesthetic>

    <craft_targets>
        Starting dimensions for local peer groups, not composition mandates. Adjust them for content and actual routes; section sizes and counts follow meaning.

        - flow node: 280×100, never narrower than 240
        - node gaps: 200 across a row, 100 down a column
        - arrow corridor: 100 of clear channel wherever a wire and its label pass between siblings
        - section gutters: 200 side by side, 220 between stacked rows
        - frame padding: 40 inside every frame before its first child
    </craft_targets>
</style_guide>
