<!-- Generated from packages/canvas/src/authoring/design.ts (sha256 44e8aad4c8ae44d62218846c82c278e4f0f32cdc945e3bc6197b240458dd228c). Do not edit. Regenerate with `bun packages/canvas-mcp/src/cli.ts guidance --write`. -->

# Diagram Design

<multi_zoom_architecture>
    Comprehensive diagrams operate at multiple zoom levels simultaneously. Think of it like a map that shows both the country borders AND the street names.

    <level_1_summary_flow>
        A simplified overview showing the full pipeline or process at a glance. Often placed at the top or bottom of the diagram.

        Example: Input → Processing → Output or Client → Server → Database
    </level_1_summary_flow>

    <level_2_section_boundaries>
        Labeled regions that group related components. These create visual "rooms" that help viewers understand what belongs together.

        Example: Grouping by responsibility (Backend / Frontend), by phase (Setup / Execution / Cleanup), or by team (User / System / External)
    </level_2_section_boundaries>

    <level_3_detail_inside_sections>
        Evidence artifacts, code snippets, and concrete examples within each section. This is where the educational value lives.

        Example: Inside a "Backend" section, you might show the actual API response format, not just a box labeled "API Response"
    </level_3_detail_inside_sections>

    For comprehensive diagrams, aim to include all three levels. The summary gives context, the sections organize, and the details teach.

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

<section_boundaries>
    Plan sections around natural visual groupings from the diagram plan. A typical large diagram might split into:

    - Entry point / trigger
    - First decision or routing
    - Main content, which may be the largest section
    - Remaining phases, outputs, etc.

    Each section should be independently understandable: its elements, internal connections, and cross-references to adjacent sections.

    These are examples, not required sections for every diagram.
</section_boundaries>

<visual_pattern_library>
    Choose the arrangement that expresses the relationship. Patterns can be combined within the same diagram.

    Each pattern contains its name, description, ASCII representation, and use case.

    <patterns>
      <pattern id="fan-out">
        <name>Fan-Out</name>
        <description>One source produces or delegates to many recipients. Spread recipients across the reading direction and label the dispatched work. Conditional choices belong to a decision; parallel delegation shows the recipients that actually work.</description>
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
        <description>Ordered stages or events form a readable chain with labeled transitions. Preserve order, conditions, and terminal outcomes. A timeline uses supported steps or event objects. The line under each stage is its detail: one fact, not a description.</description>
        <ascii xml:space="preserve"><![CDATA[
    [Request] --> [Validate] --> [Process] --> [Respond]
     POST /runs    JSON schema    worker pool   201 Created]]></ascii>
        <use_case>A request passes through validation, processing, and response delivery.</use_case>
      </pattern>
      <pattern id="feedback-cycle">
        <name>Feedback Cycle</name>
        <description>A result affects later work through a return connection between distinct stages or participants. Label the return trigger and destination. Canvas rejects a self-loop on one object.</description>
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
        <description>Several participants use one shared store placed near its consumers. Label read/write relationships and retain one store instead of drawing misleading duplicates.</description>
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

    The ASCII sketches show conceptual arrangements. Draw them using supported Canvas objects and connections.

    Repeated meaning deserves a repeated pattern. Use different patterns when the relationships differ.
</visual_pattern_library>

<text_and_evidence>
    <labels>
        - Object labels briefly name the thing or action.
        - Connection labels briefly name the relationship, payload, trigger, or branch condition.
        - Section titles briefly name the group or responsibility.

        Use native labels and titles. Canvas has no standalone text object.

        <name_and_detail>
            Shapes, icons, and sections each carry a name and at most one detail line.

            - The name (`text`) says what the thing is in 5 words or fewer, on one line, with no sentences.
            - The detail (`detail`) is one short fact, such as a port, path, version, model, host, or size. It renders muted on one line under the name, or after a section's title. Keep it to 48 characters or fewer, with no sentences.
            - Explanations, rationale, caveats, and examples go on a Markdown sticky beside the subject.

            | Bad | Good |
            | --- | --- |
            | name `Postgres database that stores user sessions` | name `Postgres`, detail `16 · :5432`, and a sticky about the sessions it stores |
            | name `canvas-agent` with `port 4820` on a second line | name `canvas-agent`, detail `harness · :4820` |
            | detail `Handles auth. Retries 3 times on failure.` | detail `3 retries · 30s timeout`, and the auth explanation on a sticky |
        </name_and_detail>

        <section_icons>
            A section's header can start with an icon. Give a section one when a glyph fits what the region holds: a generic glyph for its role, such as `database`, `cloud`, `users`, or `server`, or a brand logo for a technology the diagram names, such as `brand-postgres`, `brand-docker`, or `brand-anthropic`. When no glyph fits, leave the icon off. Never add one for decoration.

            Example: title `Bun services`, detail `127.0.0.1`, icon `brand-bun`.
        </section_icons>
    </labels>

    <draw_rules_not_prose>
        A rule that names a trigger and an effect is structure, so draw it. "On timeout, retry the next backend", "a failure after streaming starts is not retried", "a regressing variant is pulled from traffic": each is a labeled wire, a decision with labeled exits, or a node, never a sentence in a note.

        - Before you write a note, list the rules in the source material. Draw every one you can as a wire or branch.
        - A note keeps only what wires cannot show: a payload's shape, a sample record, a short rationale.
        - Keep each note to 40 words or fewer, beside the one subject it explains. dense-note warns past that.
        - A note never outweighs the diagram. Two or three short notes at the side of the flow is the most a board needs.
    </draw_rules_not_prose>

    <cover_every_requirement>
        A judge reads the source line by line and looks for each requirement on a node or a wire. A fact only in a note, the board description, or a section subtitle counts as missing.

        - Before you place anything, list every requirement in the source: each component, each field or measure it names, and each behavior with its trigger.
        - Give each component a node. Put each named field or measure in that node's detail, or on the wire that carries it.
        - Draw each behavior as a wire from the node that acts to the node it changes, labeled with its trigger. A behavior in a detail line is not drawn.
        - Every node has a wire in and a wire out, except a start, an end, or a store. A node with no wire states nothing about the flow.
        - Before canvas_check, read the list again and tick each item against a node or a wire.
    </cover_every_requirement>

    <stickies>
        Use Markdown stickies for explanations, rationale, and sample data that need more than a short label. Draw constraints and rules instead (see draw_rules_not_prose).

        - Use headings to organize the content.
        - Use bullets for distinct points.
        - Use bold for emphasis.
        - Use code formatting for technical examples.

        Place each sticky near the subject it explains, clear of connection paths.
    </stickies>

    <evidence_artifacts>
        Evidence artifacts are concrete examples that prove your diagram is accurate and help viewers learn. Include them in technical diagrams.

        <artifact_types>
            - Code snippets: APIs, integrations, implementation details.
            - Data/JSON examples: data formats, schemas, payloads.
            - Event/step sequences: protocols, workflows, lifecycles.
            - Real input content: showing what goes IN to a system.
            - API/method names: real function calls and endpoints.
        </artifact_types>

        Put code, payloads, and longer examples in Markdown stickies. Use actual API, method, and event names in short labels where they belong, and a real port, path, or version in the detail line of the node it describes.

        Draw event and step sequences with supported objects and connections.

        <streaming_protocol_example>
            For a diagram about a streaming protocol, you might show:

            - The actual event names from the spec (not just "Event 1", "Event 2")
            - A code snippet showing how to connect
            - What the streamed data actually looks like
        </streaming_protocol_example>

        <transformation_pipeline_example>
            For a diagram about a data transformation pipeline:

            - Show sample input data (actual format, not "Input")
            - Show sample output data (actual format, not "Output")
            - Show intermediate states if relevant
        </transformation_pipeline_example>

        The key principle: show what things actually look like, not just what they're called.

        Every concrete fact comes from the source material. Never invent an example value, file path, line number, score, endpoint, status code, or protocol to fill an artifact. When the source gives no concrete example, show the real names it does give and leave the artifact out.
    </evidence_artifacts>

    <purposeful_containers>
        Add containers only when they serve a purpose.

        A shape represents a thing or an action. A section represents an ownership or functional boundary. A sticky explains a nearby subject.

        The container test: what relationship would disappear if this enclosing section were removed?

        Use native labels for names and Markdown stickies for supporting prose. Do not create empty shapes merely to hold explanations.
    </purposeful_containers>
</text_and_evidence>

<layout_and_connections>
    <air_for_labels>
        The board takes the size its content needs. There is no size cap: a packed board loses more than a large one, because every wire label then fights its neighbors for room.

        - Space nodes 200px apart across a row and 100px apart down a column, and close every section around its children with fit_section.
        - A label on a wire that runs across a row needs 8.4px per character plus 46px of gap, so the 200px row gap holds 18 characters. Before you connect, widen the gap for a longer label, or run that wire down a column, where any label fits. unreadable-labels warns when a chip does not fit.
        - Never shrink a node, cut a label, or stretch a side section to make the board square or to hit a size. Size each section to its content.
    </air_for_labels>

    <build_it_once>
        Every move, resize, and relabel after the board is wired is rework, and rework costs more calls than the first draw. Settle the plan first, then place each thing once.

        - Before the first place_shape, write the plan: the sections and their rows, the nodes in each row, the color key, and every wire with its label.
        - place_shape carries the name, the detail and the color in one call. Never place a node and then name or color it in a second call.
        - Keep each node at its default size: 280×100 for a shape, 300×120 for an icon. Do not resize nodes one by one to make a row match. Resize only a node whose text clips, or the board's one visual anchor.
        - Label a wire only when it names a condition, a branch, or a payload the source names. A plain next-step wire needs no label.
        - When two or more nodes share a type and a role, such as three graders or two providers, finish one with its name, detail, and color. Then clone it for each peer with its own text and detail.
        - Place every section, place every node, then connect. When every wire is drawn, call tighten_wires once: it slides each box toward the boxes it is wired to and keeps only the moves that shorten the wires, so it does the move_to work. Then call canvas_check, and fix all its findings in one pass.
    </build_it_once>

    <hierarchy_through_scale>
        Use size to distinguish the visual anchor, primary elements, and supporting detail.

        Size objects to their content and role. Nodes with the same role read best at the same size.

        Color follows the board's color key: one hue per role, red only for failures, and gray wires. Read the color_palette topic before you color anything.
    </hierarchy_through_scale>

    <whitespace>
        Give important elements room around them. Leave purposeful whitespace between groups and around labels.

        Reserve clear corridors for connections and their labels.
    </whitespace>

    <flow_direction>
        Guide the eye: typically left→right or top→bottom for sequences, radial for hub-and-spoke.
    </flow_direction>

    <connections>
        Position alone doesn't show relationships. Draw explicit connections for flow, dependencies, and causal handoffs.

        Connect the actual participants when showing individual work. A section endpoint represents a relationship with the subsystem as a whole.

        Place closely related regions near each other. Align directly connected endpoints where useful.

        Fix unnecessary elbows and long detours by moving objects or regions and clearing obstructions before adding route steering.

        Start each wire at the node that sends and end it at the node that acts on it. A wire from the wrong participant states a wrong fact, even when the label is right. A wire to a section's frame names no actor and stops at a border; wire-to-section warns. When several nodes inside act, connect one wire per node.

        A wire meets an icon at its tile, never through the caption under it. A side port reached from below runs through the name and detail; caption-crossed warns, and the fix is the port (anchor top, or the side level with the other end) or a move, not a waypoint.
    </connections>

    <returns_retries_and_failures>
        Return, retry, fallback, and failure wires run against the main flow, so they make the long detours viewers notice first.

        - Place the target of a return or retry next to its source, in the same section when it belongs there. The wire then runs a short way along the near side of the flow.
        - Put failure ends (a reject, a dead letter, a flag) directly beside or below the step that fails, not across the board.
        - When a return wire must leave its section, place the two sections next to each other. Never route it around a third section.
        - Before you place the first section, count the wires between each pair of sections. Put the pair with the most wires side by side or one directly above the other, then the next pair, so no wire has a third section between its ends. Five full-width bands stacked down the page put two bands between the top and the bottom one, and every wire between them runs around the board.
        - wire-detour errors on a wire that runs around or through a section holding neither of its ends, on the drawn route, so a waypoint cannot clear it. Only a move clears it: move_to the node that receives the wire beside the node that sends it, or move_to a section so the two sections touch.
        - If a wire runs more than half the board or crosses a section it does not belong to, move a node. Do not add waypoints.
        - Total wire length is what a viewer reads as layout: the shorter the wires on the whole board, the clearer the flow. tighten_wires reports the length before and after; a board whose wires sum to under ten times its longer edge reads as tidy.
        - Give every decision and retry all its exits. A retry that can succeed needs its wire back to the main path, and a queue that waits needs its wire out when capacity frees.
        - Draw each failure path to its end, with every step the source requires. A cancel that must stop a stream, abandon tool calls and release a runner needs a wire to each of the three, not one bare node. A failure that the system records and then continues past needs its wire back to the next step.
        - Lay out sections in the order the main flow visits them, so the main path runs one way. A row that runs backward against the others reads as a return.
        - Size each section to its content. When one section holds three nodes and another holds ten, the small one is narrow or short, not a full-width band. fit_section closes it.
    </returns_retries_and_failures>
</layout_and_connections>
