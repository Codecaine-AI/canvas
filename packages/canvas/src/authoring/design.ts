import { NAME_TARGET_WORDS, NOTE_MAX_WORDS } from "../board/text-rules";
import { JUDGE_PNG_MAX_EDGE } from "../render/judge-size";
import { creationDefaultFor } from "../session/tools/creation-defaults";
import { CRAFT_TARGETS } from "./style-guide/craft-targets";
import { renderVisualPatterns } from "./visual-patterns";

/** A creation default's size as `W×H`. */
function defaultSize(kind: "shape" | "icon"): string {
  const { width, height } = creationDefaultFor(kind).size;
  return `${width}×${height}`;
}

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
    A good diagram reads at three zoom levels: a summary flow (Client → Server → Database), sections that group what belongs together (by responsibility, phase, or owner), and concrete detail inside each section (the real API response, not a box labeled "API Response").

    <bad_vs_good>
        | Bad (Displaying) | Good (Arguing) |
        | --- | --- |
        | 5 equal boxes with labels | Each concept has a shape that mirrors its behavior |
        | Card grid layout | Visual structure matches conceptual structure |
        | Icons decorating text | Shapes that ARE the meaning |
        | Same container for everything | Distinct visual vocabulary per concept |
        | Everything in a diagram node | Short names, Markdown stickies for prose, and selective section containers |
    </bad_vs_good>
</multi_zoom_architecture>

<visual_pattern_library>
    Choose the arrangement that expresses the relationship. The sketches are conceptual, not coordinates. Repeat a pattern for repeated meaning.

${renderVisualPatterns().split("\n").map(line => `    ${line}`).join("\n")}
</visual_pattern_library>

<text_and_evidence>
    <names>
        A node shows its name only; put extra context in a sticky note next to it. A section carries a title only.

        - The name (\`text\`) says what the thing is in ${NAME_TARGET_WORDS} words or fewer, on one line, with no sentences.
        - Explanations, rationale, and examples go on a Markdown sticky beside the subject, in ${NOTE_MAX_WORDS} words or fewer.

        | Bad | Good |
        | --- | --- |
        | name \`Postgres database that stores user sessions\` | name \`Postgres\`, and a sticky about the sessions it stores |

        Give a section a header icon when a glyph fits what it holds: a generic glyph for its role, such as \`database\`, or a brand logo for a technology the source names, such as \`brand-postgres\`. Leave it off when none fits.
    </names>

    <wire_labels>
        Label a wire only for a condition, a branch, or a payload the source names. A plain next-step wire has no label.
    </wire_labels>

    <cover_every_requirement>
        A reader looks for each requirement on a node or a wire. A fact only in a note, the board description, or a section title counts as missing.

        - Before you place anything, list every component, every field or measure, and every behavior with its trigger in the source.
        - Give each component a node.
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
        The board is judged as one image of its whole extent. Up to ${JUDGE_PNG_MAX_EDGE} × ${JUDGE_PNG_MAX_EDGE}px that image is real size. Past it the image scales down and every label prints smaller.

        - Lay 4 or more sections out in 2 or 3 rows that grow down, never in one long row.
        - Size each section to its content. A section with three nodes is small, not a full-width band.
        - To fit, move sections closer or stack a long row into 2 rows. Never shrink a node or cut a label.
    </board_size>

    <build_order>
        Every move after the board is wired is rework. Write the plan first: the sections in rows, the nodes in each section as rows, the color key, and every wire.

        1. place_section for each section, with its title, icon, and color in one call. Leave wide room between sections. Step 4 closes it.
        2. place_shape for each node inside its section, with its name and color in one call. Keep the default size: ${defaultSize("shape")} for a shape, ${defaultSize("icon")} for an icon. clone a finished node for each peer of the same role.
        3. arrange_section for each section, with its node ids as rows. It sets the gaps (${CRAFT_TARGETS.nodeGapRow} across a row, ${CRAFT_TARGETS.nodeGapColumn} down a column) and fits the frame, so you write no coordinates.
        4. arrange each row of sections with space and gap ${CRAFT_TARGETS.sectionGutterSideBySide}, then arrange the same row with align top.
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
        - A wire that runs around or through a section holding neither end needs a move, not a waypoint: move the receiving node beside the sender, or a section beside its partner.
        - Give every decision and retry all its exits, and draw each failure path to its end.
    </returns_retries_and_failures>
</layout_and_connections>`,
  },
];
