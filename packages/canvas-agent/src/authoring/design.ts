import { DETAIL_MAX_CHARS, NAME_TARGET_WORDS } from "../board/text-rules";
import { renderVisualPatterns } from "./visual-patterns";

/** Shared diagram-design knowledge. No agent state, tools, or model runtime. */
export interface AuthoringTopic {
  readonly id: string;
  readonly title: string;
  readonly text: string;
}

export const DESIGN_TOPICS: readonly AuthoringTopic[] = [
  {
    id: "diagram_design",
    title: "Diagram Design",
    text: `<multi_zoom_architecture>
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

${renderVisualPatterns().split("\n").map(line => `    ${line}`).join("\n")}

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

            - The name (\`text\`) says what the thing is in ${NAME_TARGET_WORDS} words or fewer, on one line, with no sentences.
            - The detail (\`detail\`) is one short fact, such as a port, path, version, model, host, or size. It renders muted on one line under the name, or after a section's title. Keep it to ${DETAIL_MAX_CHARS} characters or fewer, with no sentences.
            - Explanations, rationale, caveats, and examples go on a Markdown sticky beside the subject.

            | Bad | Good |
            | --- | --- |
            | name \`Postgres database that stores user sessions\` | name \`Postgres\`, detail \`16 · :5432\`, and a sticky about the sessions it stores |
            | name \`canvas-agent\` with \`port 4820\` on a second line | name \`canvas-agent\`, detail \`harness · :4820\` |
            | detail \`Handles auth. Retries 3 times on failure.\` | detail \`3 retries · 30s timeout\`, and the auth explanation on a sticky |
        </name_and_detail>

        <section_icons>
            A section's header can start with an icon. Give a section one when a glyph fits what the region holds: a generic glyph for its role, such as \`database\`, \`cloud\`, \`users\`, or \`server\`, or a brand logo for a technology the diagram names, such as \`brand-postgres\`, \`brand-docker\`, or \`brand-anthropic\`. When no glyph fits, leave the icon off. Never add one for decoration.

            Example: title \`Bun services\`, detail \`127.0.0.1\`, icon \`brand-bun\`.
        </section_icons>
    </labels>

    <stickies>
        Use Markdown stickies for explanations, rationale, constraints, and other text that needs more than a short label.

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
    </evidence_artifacts>

    <purposeful_containers>
        Add containers only when they serve a purpose.

        A shape represents a thing or an action. A section represents an ownership or functional boundary. A sticky explains a nearby subject.

        The container test: what relationship would disappear if this enclosing section were removed?

        Use native labels for names and Markdown stickies for supporting prose. Do not create empty shapes merely to hold explanations.
    </purposeful_containers>
</text_and_evidence>

<layout_and_connections>
    <hierarchy_through_scale>
        Use size to distinguish the visual anchor, primary elements, and supporting detail.

        Size objects to their content and role. Nodes with the same role read best at the same size.
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
    </connections>
</layout_and_connections>`,
  },
];
