/**
 * The regression guard: what a drawer pass made worse, from the board before
 * it to the board it left. Round 5 cycle 4: the loop's own revise passes made
 * faults that no finding named. On board 14 one pass stretched a wire from
 * 973 to 1560 px, and a section move left a note 1000 px from the section it
 * names. Each is a computed finding of the round that reviews the pass
 * (critic.ts critiqueBoard). It compares 2 boards, so it stands for one
 * round: the next round compares the next pass.
 */
import type { Board, BoardObject } from "./review-inputs.ts";
import { MAX_ROUTE_FAULTS, pathOf, type ComputedFault } from "./space.ts";
import type { WireFact } from "./wires.ts";

/** A board as the guard reads it: the board file and its routed wires (wires.ts wireFacts). */
export interface Reading { board: Board; facts: WireFact[] }

/** A wire is longer when it grew by this part and by this many px, both. */
export const LONGER = { part: 1.2, px: 200 };
/** A note over this many px from the node or section it names is far from it. */
export const NOTE_FAR_PX = 400;
/** The most far notes a round reports. */
export const MAX_NOTE_FAULTS = 2;

const STICKY = "sticky";
const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** The px between 2 boxes: 0 when they touch or overlap. */
const apart = (a: BoardObject["geometry"], b: BoardObject["geometry"]) =>
  Math.round(Math.hypot(Math.max(0, a.x - (b.x + b.width), b.x - (a.x + a.width)), Math.max(0, a.y - (b.y + b.height), b.y - (a.y + a.height))));

/**
 * The node or section a note names: the one whose id or title is the note's
 * bold lead (`**Daytona** · per node`), or starts with it. Null when the note
 * has no bold lead, or when the lead names no object or more than one.
 */
function namedBy(note: BoardObject, board: Board): BoardObject | null {
  const lead = normal(/^\s*\*\*(.+?)\*\*/.exec(note.text ?? "")?.[1] ?? "");
  if (!lead) return null;
  const named = board.objects.filter((object) => object.type !== STICKY && object.geometry
    && [normal(object.id), normal(object.text ?? "")].some((name) => name === lead || name.startsWith(`${lead} `)));
  return named.length === 1 ? named[0]! : null;
}

/**
 * The faults a pass made, most first: each wire with the same 2 ends that is
 * 20% and 200 px longer, and each note that was within NOTE_FAR_PX of the
 * node or section it names and is not now.
 */
export function regressions(before: Reading, after: Reading): ComputedFault[] {
  const was = new Map(before.facts.map((fact) => [fact.id, fact]));
  const longer = after.facts.flatMap((fact) => {
    const old = was.get(fact.id);
    const same = old && old.from === fact.from && old.to === fact.to;
    return same && fact.length >= old.length * LONGER.part && fact.length - old.length >= LONGER.px ? [{ fact, old }] : [];
  }).sort((a, b) => (b.fact.length - b.old.length) - (a.fact.length - a.old.length)).slice(0, MAX_ROUTE_FAULTS).map(({ fact, old }): ComputedFault => ({
    kind: "route", key: JSON.stringify(["longer", fact.id]), ids: [fact.id],
    problem: `The last pass made wire ${fact.id} (${fact.from} → ${fact.to}) longer: ${old.length} → ${fact.length} px, ${Math.round((fact.length / old.length - 1) * 100)}% more.`
      + " A fix of one finding must not stretch another wire: find the route or the place that keeps this wire short too",
    marks: [pathOf(fact)],
  }));
  const then = new Map(before.board.objects.map((object) => [object.id, object]));
  const notes = after.board.objects.flatMap((note) => {
    const named = note.type === STICKY && note.geometry ? namedBy(note, after.board) : null;
    const [old, target] = [then.get(note.id), named && then.get(named.id)];
    if (!named || !old?.geometry || !target?.geometry) return [];
    const [from, to] = [apart(old.geometry, target.geometry), apart(note.geometry, named.geometry)];
    return from <= NOTE_FAR_PX && to > NOTE_FAR_PX ? [{ note, named, from, to }] : [];
  }).sort((a, b) => b.to - a.to).slice(0, MAX_NOTE_FAULTS).map(({ note, named, from, to }): ComputedFault => ({
    kind: "note", key: JSON.stringify(["note", note.id]), ids: [note.id, named.id],
    problem: `The last pass left note ${note.id} ${to} px from ${named.type === "section" ? "section" : "node"} ${named.id}, which it names: it was ${from} px from it.`
      + ` A note over ${NOTE_FAR_PX} px from what it names reads as a note on something else`,
    marks: [{ box: note.geometry }, { box: named.geometry }],
  }));
  return [...longer, ...notes];
}
