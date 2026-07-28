/**
 * The gesture reference of the <capabilities> context block: what each call
 * DOES to the board. Each tool's parameter schema already carries its fields,
 * so nothing here restates a field — these entries carry consequences only.
 *
 * Two hard rules hold this file together:
 *
 *   1. The roster is generated, the prose is hand-written. `OP_REFERENCE` is
 *      keyed by tool name and the block is emitted by walking `operationTools`
 *      (service/session/tools/operations) — the registration roster itself.
 *      Order inside a group, and the order of the groups, are read off that
 *      roster, so a gesture added, moved, or dropped there moves this block
 *      with it.
 *   2. The guard below runs both ways. A registered tool with no prose throws
 *      at import; prose for a tool nobody registers throws too. Documentation
 *      that has drifted from the surface is a build failure, never a lie the
 *      model reads.
 *
 * Behavioral truth comes from service/session/tools/operations — verify a
 * claim there before writing it here.
 */
import { operationTools } from "../../../../service/session/tools/operations";

/** The verb groups the gesture roster is built in. */
export type GestureGroup =
  | "place"
  | "arrange"
  | "content"
  | "sections"
  | "edges"
  | "delete";

interface OpReferenceEntry {
  /** The verb group whose block this tool is documented under. */
  group: GestureGroup;
  /** Short `→` consequence lines: effects, guards, and what returns. */
  consequences: readonly string[];
}

/** What each verb group is FOR — one line under its tag, before the tools. */
export const GESTURE_GROUP_BLURBS: Record<GestureGroup, string> = {
  place:
    "Putting something new on the board. A placement carries an id, a position, and the text if the kind is created with text — nothing else. Size and color come from the defaults, and every property beyond them is its own gesture afterwards, if the object earns it.",
  arrange:
    "Moving and sizing what is already there. Sections travel and re-pitch as whole frames, carrying their contents with them. Edges are never targets here — they re-route themselves when the boxes they join move.",
  content:
    "What a thing says and how it looks, one home per concern: all text goes through update_text and all color through change_color, whatever the kind — edges included.",
  sections:
    "A frame handled as a frame: close it around its contents, restroke it, protect or release its region.",
  edges:
    "Restyling, repointing, and routing are three different jobs and three different gestures. Every one of these returns the edge's fresh numbered polyline, so a second correction in the same turn chains off the result you just read rather than off the digest, which that first correction made stale.",
  delete:
    "Taking things off the board. One verb for all three kinds, each with the cascade its kind implies.",
};

export const OP_REFERENCE: Record<string, OpReferenceEntry> = {
  // -- Place ---------------------------------------------------------------
  place_section: {
    group: "place",
    consequences: [
      "draws a titled frame that adopts whatever its edges already cover — membership is geometric, so a frame put down over existing boxes takes them in",
      "the frame keeps the footprint it lands with, however its children come and go, until you fit or resize it",
    ],
  },
  place_sticky: {
    group: "place",
    consequences: [
      "the note arrives with its text already on it, at the default note size and color",
      "it lives in whatever section its position puts it in, like any other object",
    ],
  },
  place_shape: {
    group: "place",
    consequences: [
      "the pick and the click, nothing else: the shape arrives blank, at the default size and color for its kind",
      "labelling, resizing, recoloring, and turning it are each their own gesture afterwards",
      "containment follows geometry — a shape outside every frame belongs to no section",
    ],
  },
  clone: {
    group: "place",
    consequences: [
      "the copy inherits kind, size, color, shape type, direction, and border, so a row of options matches without a number being re-specified anywhere",
      "two things it does not carry: the source's edges, and a section's contents — a cloned frame arrives empty, and filling it is yours",
      "a copy is never locked, whatever the source was",
    ],
  },
  connect: {
    group: "place",
    consequences: [
      "neither endpoint object changes — an edge owns only itself",
      "a second edge over an existing from→to pair applies with a duplicate warning; restyle the edge that is already there instead",
      "the result reports the routed polyline and every box the wire crosses — read it before calling the wire done",
    ],
  },

  // -- Arrange -------------------------------------------------------------
  move_to: {
    group: "arrange",
    consequences: [
      "sections carry their contents; containment never changes on a move",
      "the point you name becomes the box's new top-left",
    ],
  },
  move_by: {
    group: "arrange",
    consequences: [
      "the same travel rule as move_to, said as a nudge from wherever the box already is",
    ],
  },
  resize: {
    group: "arrange",
    consequences: [
      "the top-left corner stays put and the opposite edges move",
      "warns when the box can no longer hold its text — the warning names the size the content needs",
      "resizing a frame re-decides what it contains: the new edges adopt and release",
    ],
  },
  match_size: {
    group: "arrange",
    consequences: [
      "copies both dimensions from another box onto the target, so a row can match its largest member with no numbers hand-copied",
      "the source is only measured, never written — it may be locked; the target still must be editable",
    ],
  },
  align: {
    group: "arrange",
    consequences: [
      "the cross-axis gesture: it puts the named boxes on one shared edge and never changes spacing along the flow",
      "an id already carried by another named section has no position of its own and drops out — two boxes that move independently must be left",
    ],
  },
  space_out: {
    group: "arrange",
    consequences: [
      "the flow-axis gesture, and the fix for crowding: in positional order the first box holds and every later one slides until the clear gap between neighbours is the one you asked for",
      "the run grows or shrinks to suit and the cross axis is untouched",
    ],
  },

  // -- Content & appearance ------------------------------------------------
  update_text: {
    group: "content",
    consequences: [
      "one home for every kind's text — a sticky's body, a section's title, a shape's label, an edge's label",
      "text that no longer fits its box still applies, with a warning naming the size the box would need",
      "empty clears it; an emptied edge label is a removed chip, not a blank one",
    ],
  },
  change_color: {
    group: "content",
    consequences: [
      "one pick from the board's closed roster; the renderer derives the fill, stroke, and text tones from it",
      "works on every colorable kind, edges included — there is no separate edge-color gesture",
    ],
  },
  change_shape: {
    group: "content",
    consequences: [
      "swaps what a shape is and which way it points; glyphs are types, so naming a glyph makes the object that icon, and naming a shape drops any glyph it had",
      "a facing the new type does not accept is dropped with a note rather than refused",
      "sections, stickies, and edges are not shapes and are refused",
    ],
  },

  // -- Sections ------------------------------------------------------------
  fit_section: {
    group: "sections",
    consequences: [
      "snugs the frame around its current children with padding, and nothing else moves — the only gesture that measures content for you",
      "it fits the one section named: ancestors keep their geometry, so fit them yourself afterwards, innermost first",
      "an empty section has nothing to fit around — a no-op with a note; give it a size with resize instead",
    ],
  },
  change_section_border: {
    group: "sections",
    consequences: [
      "restrokes the frame and touches nothing else — the fill, the title chip, and the contents are left exactly as they were",
    ],
  },
  lock: {
    group: "sections",
    consequences: [
      "gates what every other gesture may do to the frame and everything inside it",
      "sections only: a lock protects a region of the board, not a single object",
    ],
  },
  unlock: {
    group: "sections",
    consequences: [
      "a lock the user set is a don't-touch signal — unlock only when the request requires it, and say so in the finalize message when you do",
      "a frame that was not locked is a no-op",
    ],
  },

  // -- Edges ---------------------------------------------------------------
  style_edge: {
    group: "edges",
    consequences: [
      "the line and its arrowheads only — color is change_color and the label is update_text",
    ],
  },
  change_connection: {
    group: "edges",
    consequences: [
      "repoints the edge alone; neither endpoint object moves",
      "an end you supply must be on the board, and the edge's two ends must still differ once the change lands",
    ],
  },
  reroute: {
    group: "edges",
    consequences: [
      "replaces the interior corners wholesale; the endpoints stay where the objects put them",
      "a path that is not orthogonal is refused — consecutive corners must share an x or a y",
    ],
  },
  shift_segment: {
    group: "edges",
    consequences: [
      "slides one segment of the printed route perpendicular to itself; orthogonality survives by construction",
      "the sN index is read off the numbered route in the newest result for that edge, never off an older printing of it",
    ],
  },
  reset_route: {
    group: "edges",
    consequences: [
      "drops the manual corners and the endpoint pins together and hands the edge back to the auto-router",
      "an edge already on the auto-router is a no-op",
    ],
  },
  move_label: {
    group: "edges",
    consequences: [
      "pins the label chip along the routed path — the way to clear a label that sits under something, short of deleting the words",
      "\"auto\" hands the chip back to the routed midpoint",
    ],
  },

  // -- Delete --------------------------------------------------------------
  delete: {
    group: "delete",
    consequences: [
      "one verb, three cascades: an object goes with every edge attached to it, a section goes with everything inside it, an edge goes alone and leaves the two objects it joined",
      "the board's last section is refused — every board keeps at least one, so put the replacement down first",
      "move the children out first if you are removing a frame but meant to keep what was in it",
    ],
  },
};

/**
 * Every registered gesture must be documented and every documented gesture
 * must be registered. Both directions throw at import, so a block that has
 * drifted from the roster is caught by the build rather than by a run.
 */
function assertReferenceMatchesRoster(): void {
  const registered = operationTools.map((tool) => tool.name);
  const undocumented = registered.filter((name) => OP_REFERENCE[name] === undefined);
  if (undocumented.length > 0) {
    throw new Error(
      `<capabilities> states no consequences for registered tool(s): ${undocumented.join(", ")}`,
    );
  }
  const live = new Set(registered);
  const phantom = Object.keys(OP_REFERENCE).filter((name) => !live.has(name));
  if (phantom.length > 0) {
    throw new Error(
      `<capabilities> documents tool(s) nobody registers: ${phantom.join(", ")}`,
    );
  }
}

assertReferenceMatchesRoster();

/**
 * The verb groups that have tools, in the order the roster reaches them, each
 * with its own tools in roster order. Derived, not declared: the roster is
 * already grouped (service/session/tools/operations/index.ts), so this reads
 * that grouping back instead of keeping a second copy of it.
 */
export function gestureGroups(): ReadonlyArray<{
  group: GestureGroup;
  tools: readonly string[];
}> {
  const byGroup = new Map<GestureGroup, string[]>();
  for (const tool of operationTools) {
    const { group } = OP_REFERENCE[tool.name]!;
    const tools = byGroup.get(group);
    if (tools) tools.push(tool.name);
    else byGroup.set(group, [tool.name]);
  }
  return [...byGroup].map(([group, tools]) => ({ group, tools }));
}

/**
 * The flush-left body for one verb group: the group's blurb, a blank line,
 * then each tool-name heading followed by its indented `→` consequence lines.
 * The assembly wraps it in the tag and indents the whole block.
 */
export function formatGestureGroup(
  group: GestureGroup,
  tools: readonly string[],
): string {
  const lines: string[] = [GESTURE_GROUP_BLURBS[group], ""];
  for (const name of tools) {
    lines.push(name);
    for (const consequence of OP_REFERENCE[name]!.consequences) {
      lines.push(`    → ${consequence}`);
    }
  }
  return lines.join("\n");
}
