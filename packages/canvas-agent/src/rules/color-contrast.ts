/**
 * color-contrast — color is a channel, not a decoration (warning tier).
 *
 * Three checks (v4-build-spec.md, Agent R2; Ford's color intent from the
 * design doc §2):
 *  (a) sibling sections wearing the same tint — the eye can't tell the
 *      regions apart;
 *  (b) a node whose color equals its parent section's tint — "green on
 *      green", the node melts into its background;
 *  (c) monotony — more than 70% of a section's nodes (when it has 4+)
 *      sharing one hue, so the color channel carries no information.
 *
 * Colors compare by their stored 10-roster id, with the render default
 * (gray) filled in — an uncolored board is the monotone board. The locked
 * background frame is the page, not a tint, and is exempt throughout.
 */
import type { BoardModel, BoardNode } from "../digest/board-model";
import type { LayoutRule } from "./types";

/**
 * Fraction of a section's nodes on one hue above which it reads monotone,
 * as a percentage (integer math keeps the exactly-70% edge float-safe).
 */
const MONOTONY_PERCENT = 70;
/** Minimum node count before monotony is worth calling out. */
const MONOTONY_MIN_NODES = 4;

/** Effective rendered color id: the stored pick, defaulting to gray. */
function colorOf(node: BoardNode): string {
  return node.color ?? "gray";
}

function isFrame(node: BoardNode): boolean {
  return node.kind === "section" && node.locked === "background";
}

export const rule: LayoutRule = {
  id: "color-contrast",
  title: "Color contrast",
  tier: "warning",
  guidance: [
    "Color is a channel: give sibling sections distinct tints so the regions read apart, and",
    "make children contrast their parent — never green on green. Reserve the semantic colors",
    "(red for failure/error paths, green for success/terminal-good) so they keep their",
    "meaning, and vary within the 10-color roster rather than defaulting everything gray.",
    "A section where one hue dominates says nothing; let color mean something.",
  ].join("\n"),
  check(board) {
    const findings: ReturnType<LayoutRule["check"]> = [];
    const sections = board.nodes.filter((node) => node.kind === "section" && !isFrame(node));

    // (a) Sibling sections sharing a tint, grouped per (parent, color).
    const seen = new Set<string>();
    for (const section of sections) {
      const key = `${section.parentId ?? ""}|${colorOf(section)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const sharing = sections.filter((other) =>
        (other.parentId ?? null) === (section.parentId ?? null)
        && colorOf(other) === colorOf(section));
      if (sharing.length < 2) continue;
      findings.push({
        rule: "color-contrast",
        severity: "warning",
        at: sharing.map((entry) => entry.id),
        message: `sibling sections ${sharing.map((entry) => entry.id).join(", ")} all wear ${colorOf(section)}`,
        suggestion: "give each sibling section its own tint from the roster",
      });
    }

    // (b) Node color equals its parent section's tint.
    for (const node of board.nodes) {
      if (node.kind !== "node" || node.parentId === null) continue;
      const parent = board.byId(node.parentId);
      if (!parent || parent.kind !== "section" || isFrame(parent)) continue;
      if (colorOf(node) !== colorOf(parent)) continue;
      findings.push({
        rule: "color-contrast",
        severity: "warning",
        at: [node.id, parent.id],
        where: { x: node.x, y: node.y, width: node.width, height: node.height },
        message: `${node.id} is ${colorOf(node)} on the ${colorOf(parent)} section ${parent.id} — low contrast`,
        suggestion: `recolor ${node.id} to contrast ${parent.id}`,
      });
    }

    // (c) Monotony: one hue dominating a section with enough nodes.
    for (const section of sections) {
      const members = board.childrenOf(section.id).filter((child) => child.kind === "node");
      if (members.length < MONOTONY_MIN_NODES) continue;
      const byColor = new Map<string, BoardNode[]>();
      for (const member of members) {
        const list = byColor.get(colorOf(member)) ?? [];
        list.push(member);
        byColor.set(colorOf(member), list);
      }
      let dominant: { color: string; nodes: BoardNode[] } | undefined;
      for (const [color, nodes] of byColor) {
        if (!dominant || nodes.length > dominant.nodes.length) dominant = { color, nodes };
      }
      // Strictly above MONOTONY_PERCENT, in integer math.
      if (!dominant || dominant.nodes.length * 100 <= members.length * MONOTONY_PERCENT) {
        continue;
      }
      findings.push({
        rule: "color-contrast",
        severity: "warning",
        at: [section.id, ...dominant.nodes.map((node) => node.id)],
        where: { x: section.x, y: section.y, width: section.width, height: section.height },
        message: `${dominant.nodes.length} of ${members.length} nodes in ${section.id} are ${dominant.color} — the color channel is monotone`,
        suggestion: "vary the hues within the roster so color distinguishes the roles",
      });
    }

    return findings;
  },
};
