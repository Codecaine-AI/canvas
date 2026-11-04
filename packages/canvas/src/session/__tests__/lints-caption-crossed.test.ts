import { describe, expect, test } from "bun:test";

import { rule as captionCrossed } from "../../board/lints/rules/caption-crossed";
import { LAYOUT_RULES } from "../../board/lints";
import { box, connect, makeDocument } from "./synthetic";

/**
 * A wire never runs through the caption painted under an icon's tile. The
 * two fixtures are the shapes the high-effort climb boards drew: a port slid
 * into the band with `position` (chat-assistant-rollout), and a side port
 * reached from below because a neighbor blocks the level approach
 * (eval-harness-orchestration). Both are measured on the routed polyline.
 */

function icon(id: string, x: number, y: number, text: string, detail: string) {
  return { ...box(id, x, y, 300, 120, "icon"), text, detail };
}

const page = box("page", 0, 0, 2600, 1400, "section");
const EMPTY_START = { baseline: makeDocument([]) };

describe("caption-crossed lint", () => {
  test("runs on every edit", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).toContain("caption-crossed");
  });

  test("a port slid into the caption band warns and names the port fix", () => {
    const document = makeDocument(
      [page, icon("integrations", 2000, 680, "Action integrations", "stores no credentials"), icon("account", 1520, 1000, "Account system", "subscriptions")],
      [{
        ...connect("subscription", "integrations", "account"),
        from: { objectId: "integrations", anchor: "left", position: [0, 0.85] },
        to: { objectId: "account", anchor: "top" },
      }],
    );
    const [finding] = captionCrossed.check(document, EMPTY_START);
    expect(finding?.severity).toBe("warning");
    expect(finding?.at).toEqual(["subscription", "integrations"]);
    expect(finding?.message).toBe("subscription runs 60px through integrations's caption on its way to the tile's port");
    expect(finding?.suggestion).toStartWith("change_connection subscription to meet integrations on the side away from the caption");
  });

  test("a side port reached from below runs through the caption and warns", () => {
    const document = makeDocument(
      [
        page,
        icon("pool", 1140, 200, "Bounded worker pool", "capped concurrency"),
        icon("worker", 1620, 200, "Scenario worker", "performs steps in order"),
        { ...box("record", 1140, 420, 280, 100, "process"), text: "Record product failure" },
        { ...box("outcome", 1620, 420, 300, 120, "decision"), text: "Step outcome?" },
      ],
      [{ ...connect("continue", "record", "worker"), from: { objectId: "record", anchor: "top" } }],
    );
    const findings = captionCrossed.check(document, EMPTY_START);
    expect(findings.map((finding) => finding.at)).toEqual([["continue", "worker"]]);
    expect(findings[0]?.message).toBe("continue runs 48px through worker's caption on its way to the tile's port");
  });

  test("a wire into the bottom port, under the caption, is quiet", () => {
    const document = makeDocument(
      [page, icon("worker", 1620, 200, "Scenario worker", "performs steps in order"), { ...box("record", 1630, 600, 280, 100, "process"), text: "Record" }],
      [{ ...connect("up", "record", "worker"), to: { objectId: "worker", anchor: "bottom" } }],
    );
    expect(captionCrossed.check(document, EMPTY_START)).toEqual([]);
  });

  test("boxes without a caption are never judged", () => {
    const document = makeDocument(
      [page, box("a", 100, 100, 280, 100, "process"), box("b", 600, 500, 280, 100, "process")],
      [connect("ab", "a", "b")],
    );
    expect(captionCrossed.check(document, EMPTY_START)).toEqual([]);
  });
});
