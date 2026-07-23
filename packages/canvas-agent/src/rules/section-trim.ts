/**
 * R3 · section-trim — sections frame themselves (warning tier).
 *
 * Rulebook 03-r3-section-trim: a section reserves a 64px header band for its
 * label chip, pads content 48px on the sides and bottom, and shrinks to hug
 * what is inside (corpus top insets run 64–128; cramped regions degrade
 * proportionally). The check flags the failure modes, not the ideals: an
 * effective header band under 48px, side/bottom padding under 24px, or more
 * than 160px of slack on any side (the section is not hugging).
 *
 * Insets are measured against the content bbox of the section's layout
 * children (stickies/annotations are commentary and don't count). Sides
 * where a child escapes the section (negative inset) are containment's
 * error, not trim's warning. No quickfix — trim is a framing judgment
 * (fitSectionToChildren is the usual tool).
 */
import type { BoardNode } from "../digest/board-model";
import type { LayoutRule } from "./types";

/** An effective header band thinner than this reads as cramped (ideal 64). */
const HEADER_MIN = 48;
/** Side/bottom padding thinner than this reads as cramped (ideal 48). */
const SIDE_MIN = 24;
/** More slack than this on any side means the section is not hugging. */
const HUG_SLACK = 160;

interface Insets {
  top: number;
  left: number;
  right: number;
  bottom: number;
}

function contentInsets(section: BoardNode, children: BoardNode[]): Insets {
  const minX = Math.min(...children.map((child) => child.x));
  const minY = Math.min(...children.map((child) => child.y));
  const maxX = Math.max(...children.map((child) => child.x + child.width));
  const maxY = Math.max(...children.map((child) => child.y + child.height));
  return {
    top: minY - section.y,
    left: minX - section.x,
    right: section.x + section.width - maxX,
    bottom: section.y + section.height - maxY,
  };
}

function px(value: number): number {
  return Math.round(value);
}

export const rule: LayoutRule = {
  id: "section-trim",
  title: "Section trim",
  tier: "warning",
  guidance: [
    "A section frames itself: reserve a ~64px header band for the label chip, pad content",
    "~48px on the sides and bottom, and shrink the section to hug what is inside (corpus top",
    "insets run 64–128; cramped regions may degrade proportionally). A header band under",
    `${HEADER_MIN}px or side padding under ${SIDE_MIN}px reads as cramped; more than ${HUG_SLACK}px of slack on a side`,
    "reads as an unfinished frame — fitSectionToChildren is the usual answer. Defaults, not laws.",
  ].join("\n"),
  check(board) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    for (const section of board.nodes) {
      if (section.kind !== "section") continue;
      if (section.locked === "background") continue; // the page frame is the page, not trim
      const children = board
        .childrenOf(section.id)
        .filter((child) => child.kind !== "sticky" && child.kind !== "annotationish");
      if (children.length === 0) continue;

      const insets = contentInsets(section, children);
      const issues: string[] = [];
      if (insets.top >= 0 && insets.top < HEADER_MIN) {
        issues.push(`header band ${px(insets.top)}px (<${HEADER_MIN})`);
      }
      for (const side of ["left", "right", "bottom"] as const) {
        const inset = insets[side];
        if (inset >= 0 && inset < SIDE_MIN) {
          issues.push(`${side} padding ${px(inset)}px (<${SIDE_MIN})`);
        }
      }
      for (const side of ["top", "left", "right", "bottom"] as const) {
        if (insets[side] > HUG_SLACK) {
          issues.push(`${side} slack ${px(insets[side])}px (>${HUG_SLACK} — not hugging)`);
        }
      }
      if (issues.length === 0) continue;

      findings.push({
        rule: "section-trim",
        severity: "warning",
        at: [section.id],
        where: { x: section.x, y: section.y, width: section.width, height: section.height },
        message: `section ${section.id} trim: ${issues.join("; ")}`,
        suggestion: "aim for a ~64px header and ~48px side padding; fitSectionToChildren to hug",
      });
    }
    return findings;
  },
};
