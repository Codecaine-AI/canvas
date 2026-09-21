/** Composition guidance. Numeric defaults are starting points for local groups. */
import type { StyleTopic } from "./types";

const PROSE = `Let the system determine the composition.

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
- Trace applicable normal, failure, and feedback paths separately without notes; recompose implied or misleading handoffs and check explicit store and control relationships.`;

export const style: StyleTopic = {
  id: "aesthetic",
  title: "The aesthetic",
  prose: PROSE,
};
