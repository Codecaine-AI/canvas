/**
 * covered-content — nothing may sit on content (error tier).
 *
 * The one lint left: overlap is what the system cannot prevent, since the
 * drawer places the boxes. Both checks read real geometry, and only real
 * overlaps count — contact is not a finding:
 * - box-on-box: any two boxes, in the same section or not (sections and
 *   stickies exempt, so a box is never "on" the section that holds it),
 *   whose painted faces (paintedRects: an icon's tile and caption, any other
 *   box's face — never the empty sides of an icon's box) intersect by more
 *   than 25% of the smaller painted area or cover a box's text center;
 * - section-on-section: two sections whose frames overlap when neither
 *   contains the other in the section tree (sections grow to hold their
 *   children, and a grow can push one frame into its neighbor);
 * - section-on-box: a section frame partly over a box it does not hold, by
 *   the box-on-box measure (more than 25% of what the box paints, or its
 *   text center). A box wholly inside the frame reads as grouped, not
 *   covered; the injected page frame and a box's own ancestors are exempt.
 *
 * Label chips are not judged here: the renderer places each chip clear
 * along its own wire (connectors/label-placement.ts), and the chips that
 * find no clear spot are a number in canvas_check's LAYOUT block.
 */
import { paintedRects, type Rect } from "../geometry";
import { kindOf } from "../../helpers";
import { PAGE_FRAME_ID } from "../../page-frame";

import type { LayoutRule } from "../types";

/** Intersection larger than this fraction of the smaller box is an error. */
const OVERLAP_FRACTION = 0.25;

function intersection(aRect: Rect, bRect: Rect): Rect | undefined {
  const x = Math.max(aRect.x, bRect.x);
  const y = Math.max(aRect.y, bRect.y);
  const width = Math.min(aRect.x + aRect.width, bRect.x + bRect.width) - x;
  const height = Math.min(aRect.y + aRect.height, bRect.y + bRect.height) - y;
  if (width <= 0 || height <= 0) return undefined;
  return { x, y, width, height };
}

const area = (rect: Rect) => rect.width * rect.height;

/** The bounding rect of `rects` (at least one). */
function bounds(rects: readonly Rect[]): Rect {
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Is the node's text center strictly inside one of `rects`? The text center
 * is the center of the last face it paints: an icon's caption band (its
 * tile when it has no caption), any other box's face.
 */
function coversTextCenter(painted: readonly Rect[], rects: readonly Rect[]): boolean {
  const face = painted[painted.length - 1]!;
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2;
  return rects.some((rect) => cx > rect.x && cx < rect.x + rect.width && cy > rect.y && cy < rect.y + rect.height);
}

/** True when `ancestorId` is `id` itself or one of its section ancestors. */
function isAncestor(byParent: ReadonlyMap<string, string | null>, ancestorId: string, id: string): boolean {
  let at: string | null | undefined = id;
  for (let steps = 0; at != null && steps <= byParent.size; steps += 1) {
    if (at === ancestorId) return true;
    at = byParent.get(at);
  }
  return false;
}

const GUIDANCE = `Nothing sits on content. Blocking (error tier):
- a box overlap that swallows more than a quarter of what the smaller box paints (an icon's
  tile and caption, a shape's face), or lands on its text;
- two section frames overlapping when neither holds the other;
- a section frame over a box it does not hold.
Fix it by moving a box, or a section and its children, clear. Stickies float above the
diagram and are exempt. Overlap and integrity are the only checks: wire routes, label chips,
text fit and section fit are automatic, and integrity fires only when something bypassed them.`

export const rule: LayoutRule = {
  id: "covered-content",
  title: "Covered content",
  tier: "error",
  guidance: GUIDANCE,
  check(document, context) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const boxes = document.objects.filter((object) => kindOf(object) === "node");

    // 1 — box-on-box, on what each box paints.
    const faces = new Map(boxes.map((node) => [node.id, paintedRects(node, context?.canvasStyle)]));
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const aFaces = faces.get(a.id)!;
        const bFaces = faces.get(b.id)!;
        const pieces = aFaces.flatMap((aFace) => bFaces
          .map((bFace) => intersection(aFace, bFace))
          .filter((piece): piece is Rect => piece !== undefined));
        if (pieces.length === 0) continue;
        const smallerArea = Math.min(
          aFaces.reduce((sum, face) => sum + area(face), 0),
          bFaces.reduce((sum, face) => sum + area(face), 0),
        );
        if (smallerArea <= 0) continue;
        const fraction = pieces.reduce((sum, piece) => sum + area(piece), 0) / smallerArea;
        const covered = [a, b].filter((node) => coversTextCenter(faces.get(node.id)!, pieces));
        const rect = bounds(pieces);
        if (fraction <= OVERLAP_FRACTION && covered.length === 0) continue;
        const pct = Math.round(fraction * 100);
        const centerNote = covered.length > 0
          ? `; covers the text center of ${covered.map((node) => node.id).join(" and ")}`
          : "";
        findings.push({
          rule: "covered-content",
          severity: "error",
          at: [a.id, b.id],
          where: rect,
          message: `${a.id} and ${b.id} overlap by ${pct}% of the smaller box${centerNote}`,
          suggestion: `move ${b.id} clear of ${a.id}`,
        });
      }
    }

    // 1b — section-on-section: frames that overlap outside a parent-child
    // line. Contact is not a finding; only a real shared area is.
    const sections = document.objects.filter((object) => kindOf(object) === "section");
    const byParent = new Map(document.objects.map((object) => [object.id, object.parentId ?? null]));
    for (let i = 0; i < sections.length; i += 1) {
      for (let j = i + 1; j < sections.length; j += 1) {
        const a = sections[i]!;
        const b = sections[j]!;
        if (isAncestor(byParent, a.id, b.id) || isAncestor(byParent, b.id, a.id)) continue;
        const shared = intersection(a.geometry, b.geometry);
        if (!shared) continue;
        findings.push({
          rule: "covered-content",
          severity: "error",
          at: [a.id, b.id],
          where: shared,
          message: `sections ${a.id} and ${b.id} overlap by ${Math.round(shared.width)}×${Math.round(shared.height)}px`,
          suggestion: `move ${b.id} clear of ${a.id}, or move the children that make one of them grow`,
        });
      }
    }

    // 1c — section-on-box: a frame grown over a box outside its tree. When
    // the box's own section already overlaps that frame, 1b reports the
    // collision once, so its children are not reported again.
    const overlapping = new Set(
      findings.filter((finding) => finding.message.startsWith("sections ")).map((finding) => [...finding.at].sort().join("\u0000")),
    );
    const sectionsOverlap = (a: string, b: string) => overlapping.has([a, b].sort().join("\u0000"));
    const ancestorsOf = (id: string): string[] => {
      const out: string[] = [];
      for (let at = byParent.get(id); at != null && out.length <= byParent.size; at = byParent.get(at)) out.push(at);
      return out;
    };
    for (const section of sections) {
      if (section.id === PAGE_FRAME_ID) continue;
      for (const node of boxes) {
        if (isAncestor(byParent, section.id, node.id)) continue;
        if (ancestorsOf(node.id).some((ancestor) => sectionsOverlap(ancestor, section.id))) continue;
        const nodeFaces = faces.get(node.id)!;
        const pieces = nodeFaces
          .map((face) => intersection(section.geometry, face))
          .filter((piece): piece is Rect => piece !== undefined);
        if (pieces.length === 0) continue;
        const nodeArea = nodeFaces.reduce((sum, face) => sum + area(face), 0);
        if (nodeArea <= 0) continue;
        const coveredArea = pieces.reduce((sum, piece) => sum + area(piece), 0);
        // Wholly inside the frame: it reads as grouped, not covered.
        if (coveredArea >= nodeArea - 0.5) continue;
        const fraction = coveredArea / nodeArea;
        const centered = coversTextCenter(nodeFaces, pieces);
        if (fraction <= OVERLAP_FRACTION && !centered) continue;
        findings.push({
          rule: "covered-content",
          severity: "error",
          at: [section.id, node.id],
          where: bounds(pieces),
          message: `section ${section.id} covers ${Math.round(fraction * 100)}% of ${node.id}, which it does not hold${centered ? ", including its text center" : ""}`,
          suggestion: `move ${node.id} clear of ${section.id}, or move the children that make ${section.id} grow`,
        });
      }
    }

    return findings;
  },
};
