import { describe, expect, it } from "bun:test";

import { sectionContainerColorMap } from "../section-depth";

describe("sectionContainerColorMap", () => {
  it("maps each object to its nearest section's color, the section default when unset", () => {
    const containers = sectionContainerColorMap([
      { id: "page", type: "section", parentId: null, color: "white" },
      { id: "agents", type: "section", parentId: "page", color: "violet" },
      { id: "plain", type: "section", parentId: "page" },
      { id: "node", type: "rectangle", parentId: "agents", color: "violet" },
      { id: "tile", type: "icon", parentId: "plain" },
      { id: "loose", type: "rectangle", parentId: null },
    ]);
    expect(containers.get("agents")).toBe("white");
    expect(containers.get("node")).toBe("violet");
    expect(containers.get("tile")).toBe("gray");
    expect(containers.has("page")).toBe(false);
    expect(containers.has("loose")).toBe(false);
  });
});
