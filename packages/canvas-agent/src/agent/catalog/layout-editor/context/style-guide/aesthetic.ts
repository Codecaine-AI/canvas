/**
 * The house aesthetic — the semantic account of what uniform layout means.
 * The craft targets carry the numeric spacing ladder; the
 * crowding lint owns the hard floor.
 */
import type { StyleTopic } from "./types";

const PROSE = `Calm and uniform — uniformity is information.

- Readers decode layout; make every signal deliberate, never accidental:
    - same size + same gap = peers
    - a bigger box = more important
    - an off-register box = an exception
- Content first:
    - size each box to what it says, with comfortable padding
    - then make peers match, sized to the largest member
- One gap per group, repeated exactly:
    - the craft targets set the node size and the gaps — hold them, reused exactly down the row or column, centers on one line
    - between sections, the wider gutter, also repeated
- Match by copying, not estimating:
    - the digest reports every peer's exact geometry — reuse a peer's size and pitch instead of inventing near-miss numbers
    - work in 16px grid units; geometry snaps to the grid anyway
- Air everywhere:
    - nothing touches a section border or the board edge
    - every label owns clear air
- Space is free:
    - the base section is the page — set it to the size the diagram wants, and it keeps that size
    - start roomy: a board that feels sparse while building lands right when it is full
    - when a region starts to feel tight, grow the base section and spread the content — never compress a diagram to fit the space you started with
    - in an edit, leave the base section alone unless the work actually needs the room
- Sections do the grouping — everything has a home:
    - many small labelled groups with air between them read better than one crowded frame — split a group before you tighten it
    - one theme, one section; content lives in a section, never floating on the bare frame
    - sections are the addressable units: a diagram gets linked whole, and its sections get linked individually — a piece without a home cannot be referenced
    - a parent sits centered over its children
- Color restrained:
    - neutral bodies by default; one accent per meaning, used consistently
    - red only for failure, green only for success
    - children contrast their parent's tint
- Wires:
    - label edges directly, never through relay nodes
    - enter and exit on the faces that point along the flow
    - two runs never share a line`;

export const style: StyleTopic = {
  id: "aesthetic",
  title: "The aesthetic",
  prose: PROSE,
};
