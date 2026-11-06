<!-- Generated from packages/canvas/src/authoring/design.ts (sha256 a4a84bfccbf57ab9bcb5bc29250a5baa6bc1fefd8343375ce5a7af2f54677ebd). Do not edit. Regenerate with `bun packages/canvas-mcp/src/cli.ts guidance --write`. -->

# Diagram Design

<multi_zoom_architecture>
    A good diagram reads at three zoom levels: a summary flow (Client → Server → Database), sections that group what belongs together (by responsibility, phase, or owner), and concrete detail inside each section (the real API response, not a box labeled "API Response").

    <bad_vs_good>
        | Bad (Displaying) | Good (Arguing) |
        | --- | --- |
        | 5 equal boxes with labels | Each concept has a shape that mirrors its behavior |
        | Card grid layout | Visual structure matches conceptual structure |
        | Icons decorating text | Shapes that ARE the meaning |
        | Same container for everything | Distinct visual vocabulary per concept |
        | Everything in a diagram node | Short names with one detail line, Markdown stickies for prose, and selective section containers |
    </bad_vs_good>
</multi_zoom_architecture>

<visual_pattern_library>
    Choose the arrangement that expresses the relationship. The sketches are conceptual, not coordinates. Repeat a pattern for repeated meaning.

    <patterns>
      <pattern id="fan-out">
        <name>Fan-Out</name>
        <description>One source produces or delegates to many recipients. Spread recipients across the reading direction. Conditional choices belong to a decision; parallel delegation shows the recipients that actually work.</description>
        <ascii xml:space="preserve"><![CDATA[
    [Source] --+--> [Recipient A]
              +--> [Recipient B]
              +--> [Recipient C]]]></ascii>
        <use_case>A coordinator dispatches independent tasks to several workers.</use_case>
      </pattern>
      <pattern id="convergence">
        <name>Convergence</name>
        <description>Several contributions reach one receiving process or participant. Make clear whether it waits for all, selects one, or aggregates. Merging arrows alone does not establish synchronization; a join barrier needs an explicit wait step or label supported by the source.</description>
        <ascii xml:space="preserve"><![CDATA[
    [Input A] --+
    [Input B] --+--> [Combine] --> [Result]
    [Input C] --+]]></ascii>
        <use_case>An aggregator combines worker results into a single report.</use_case>
      </pattern>
      <pattern id="hierarchy">
        <name>Hierarchy</name>
        <description>Parent-child ownership or decomposition expressed through repeated local branches or justified nested sections. Label ownership separately from execution order. Use supported objects and connections for the branches. Nested sections read as layers, such as a machine holding a runtime holding a sandbox, when each header carries an icon and one fact.</description>
        <ascii xml:space="preserve"><![CDATA[
    [Parent]
      +-- [Child A]
      |     +-- [Grandchild]
      +-- [Child B]
    
    +-(icon) Mac  darwin-arm64 ----------------+
    |  +-(icon) Bun services  127.0.0.1 ----+  |
    |  |  [canvas-agent]    [docs kernel]   |  |
    |  |   harness · :4820   :4840          |  |
    |  +------------------------------------+  |
    +------------------------------------------+]]></ascii>
        <use_case>A service owns two subsystems, one of which owns a smaller component.</use_case>
      </pattern>
      <pattern id="sequence">
        <name>Sequence</name>
        <description>Ordered stages or events form a readable chain. Label a transition only for its condition. Preserve order, conditions, and terminal outcomes. A timeline uses supported steps or event objects. The line under each stage is its detail: one fact, not a description.</description>
        <ascii xml:space="preserve"><![CDATA[
    [Request] --> [Validate] --> [Process] --> [Respond]
     POST /runs    JSON schema    worker pool   201 Created]]></ascii>
        <use_case>A request passes through validation, processing, and response delivery.</use_case>
      </pattern>
      <pattern id="feedback-cycle">
        <name>Feedback Cycle</name>
        <description>A result affects later work through a return connection between distinct stages or participants. Label the return with its trigger. Canvas rejects a self-loop on one object.</description>
        <ascii xml:space="preserve"><![CDATA[
    [Act] -----> [Observe]
      ^              |
      |              v
    [Adjust] <-- [Evaluate]]]></ascii>
        <use_case>An evaluator&apos;s findings guide the next revision of a generated result.</use_case>
      </pattern>
      <pattern id="transformation">
        <name>Transformation</name>
        <description>An input artifact passes through a transformation step to become an output artifact. Show what changed and which step changed it. Nearby before/after examples can explain the mechanism.</description>
        <ascii xml:space="preserve"><![CDATA[
    [Input] --> [Transform] --> [Output]
     raw record                 indexed record]]></ascii>
        <use_case>An indexing step converts a supplied source record into a searchable record.</use_case>
      </pattern>
      <pattern id="side-by-side">
        <name>Side-by-Side</name>
        <description>Two alternatives use parallel structures with corresponding parts aligned. Keep a consistent visual baseline so meaningful differences can be compared.</description>
        <ascii xml:space="preserve"><![CDATA[
    Option A                  Option B
    [Request]                 [Request]
        |                         |
        v                         v
    [Database]                [Cache] --> [Database]]]></ascii>
        <use_case>Compare direct database reads with a proposed cached read path.</use_case>
      </pattern>
      <pattern id="separation">
        <name>Separation</name>
        <description>A purposeful gap or section boundary separates phases or responsibilities. Explicit handoff connections show what crosses the boundary and who receives it. Whitespace alone cannot express causality.</description>
        <ascii xml:space="preserve"><![CDATA[
    Responsibility A           Responsibility B
    [Prepare] ----- handoff -----> [Receive]]]></ascii>
        <use_case>A producer hands a completed work item to a separately owned processing service.</use_case>
      </pattern>
      <pattern id="shared-resource">
        <name>Shared Resource</name>
        <description>Several participants use one shared store placed near its consumers. Retain one store instead of drawing misleading duplicates.</description>
        <ascii xml:space="preserve"><![CDATA[
    [Writer] --write--> [Shared Store] --read--> [Reader A]
                             |
                             +----------read--> [Reader B]]]></ascii>
        <use_case>One ingestion process updates an index that multiple query services read.</use_case>
      </pattern>
      <pattern id="state-machine">
        <name>State Machine</name>
        <description>A checked chart.mmd redrawn as a board: one node per state and one labeled edge per arrow, so the board&apos;s node and edge counts equal the chart&apos;s. Keep about 20 arrows or fewer. Labels are the reader&apos;s words from the chart, never variable or action names. Each node wears its group&apos;s color; a state that breaks a rule wears red instead and names the rule in its detail. The start state comes first in reading order.</description>
        <ascii xml:space="preserve"><![CDATA[
    [Cart open] --you press pay--> [Paying] --the card clears--> [Paid]
       teal                           yellow    |                 yellow
                                                +--the card is declined--> [Payment failed]
                                                                            red: breaks PaidOnce]]></ascii>
        <use_case>Redraw a checkout flow&apos;s statechart, its failing state marked red.</use_case>
      </pattern>
    </patterns>
</visual_pattern_library>

<text_and_evidence>
    <name_and_detail>
        Shapes, icons, and sections each carry a name and at most one detail line.

        - The name (`text`) says what the thing is in 5 words or fewer, on one line, with no sentences.
        - The detail (`detail`) is one short fact, such as a port, path, version, model, or host, in 48 characters or fewer.
        - Explanations, rationale, and examples go on a Markdown sticky beside the subject, in 40 words or fewer.

        | Bad | Good |
        | --- | --- |
        | name `Postgres database that stores user sessions` | name `Postgres`, detail `16 · :5432`, and a sticky about the sessions it stores |
        | detail `Handles auth. Retries 3 times on failure.` | detail `3 retries · 30s timeout`, and the auth explanation on a sticky |

        Give a section a header icon when a glyph fits what it holds: a generic glyph for its role, such as `database`, or a brand logo for a technology the source names, such as `brand-postgres`. Leave it off when none fits.
    </name_and_detail>

    <wire_labels>
        Label a wire only for a condition, a branch, or a payload the source names. A plain next-step wire has no label.
    </wire_labels>

    <cover_every_requirement>
        A reader looks for each requirement on a node or a wire. A fact only in a note, the board description, or a section detail counts as missing.

        - Before you place anything, list every component, every field or measure, and every behavior with its trigger in the source.
        - Give each component a node. Put each field or measure in that node's detail.
        - Draw each behavior as a wire from the node that acts to the node it changes. A rule with a trigger and an effect is a wire, a decision with its exits, or a node, never a sentence in a note.
        - Every node has a wire in and a wire out, except a start, an end, or a store.
        - Before canvas_check, tick each item on the list against a node or a wire.
    </cover_every_requirement>

    <evidence>
        Show what things look like, not only what they are called: real event names, a sample payload, a code snippet. Put code and payloads on a sticky beside their subject, at most two or three stickies per board. Take every concrete value from the source. Never invent an example, path, score, endpoint, or status code.
    </evidence>

    <purposeful_containers>
        A shape is a thing or an action. A section is an ownership or functional boundary. A sticky explains a nearby subject. Add a section only when removing it would lose a relationship.
    </purposeful_containers>
</text_and_evidence>

<layout_and_connections>
    <board_size>
        The board is judged as one image of its whole extent. Up to 2576 × 2576px that image is real size. Past it the image scales down and every label prints smaller.

        - Lay 4 or more sections out in 2 or 3 rows that grow down, never in one long row.
        - Size each section to its content. A section with three nodes is small, not a full-width band.
        - To fit, move sections closer or stack a long row into 2 rows. Never shrink a node or cut a label.
    </board_size>

    <build_order>
        Every move after the board is wired is rework. Write the plan first: the sections in rows, the nodes in each section as rows, the color key, and every wire.

        1. place_section for each section, with its title, icon, and color in one call. Leave wide room between sections. Step 4 closes it.
        2. place_shape for each node inside its section, with its name, detail, and color in one call. Keep the default size: 280×100 for a shape, 300×120 for an icon. clone a finished node for each peer of the same role.
        3. arrange_section for each section, with its node ids as rows. It sets the gaps (200 across a row, 100 down a column) and fits the frame, so you write no coordinates.
        4. space_out each row of sections with gap 200, then align their tops.
        5. connect every wire, then call tighten_wires once.
        6. canvas_check, then fix its errors. Overlap and integrity are the only checks: overlap is a box on a box, or a section on a section, and integrity fires only when something bypassed the automatic fixes. Wire routes, label chips, text fit, and section fit are automatic.
    </build_order>

    <connections>
        Start each wire at the node that sends and end it at the node that acts. A wire from the wrong participant states a wrong fact. When several nodes in a section act, connect one wire per node, not one to the frame.

        Color follows the board's color key: one hue per role, and red only for failures. Read color_palette before you color anything.
    </connections>

    <returns_retries_and_failures>
        Returns, retries, and failures run against the main flow, so they make the long detours a viewer notices first.

        - Before you place the first section, count the wires between each pair of sections. Put the pair with the most wires side by side, so no wire has a third section between its ends.
        - Lay out sections in the order the main flow visits them, so the main path runs one way.
        - Put the target of a return or retry next to its source, and a failure end (a reject, a dead letter) beside the step that fails.
        - A wire that runs around or through a section holding neither end needs a move, not a waypoint: move_to the receiving node beside the sender, or a section beside its partner.
        - Give every decision and retry all its exits, and draw each failure path to its end.
    </returns_retries_and_failures>
</layout_and_connections>
