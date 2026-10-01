import { describe, expect, it } from "bun:test";
import type { InteractiveCanvasObject } from "../schema";
import { sectionDepthMap } from "../section-depth";

function node(id: string, type: InteractiveCanvasObject["type"], parentId: string | null = null) {
  return { id, type, parentId };
}

describe("sectionDepthMap", () => {
  it("counts 1 + the section ancestors on the parentId chain", () => {
    const depths = sectionDepthMap([
      node("outer", "section"),
      node("inner", "section", "outer"),
      node("innermost", "section", "inner"),
      node("card", "process", "inner"),
      node("loose", "process"),
    ]);
    expect(Object.fromEntries(depths)).toEqual({ outer: 1, inner: 2, innermost: 3, card: 3, loose: 1 });
  });

  it("is order-independent and survives broken chains and parent cycles", () => {
    const depths = sectionDepthMap([
      node("child", "section", "parent"),
      node("parent", "section"),
      node("orphan", "section", "missing"),
      node("a", "section", "b"),
      node("b", "section", "a"),
    ]);
    expect(depths.get("child")).toBe(2);
    expect(depths.get("orphan")).toBe(1);
    expect(depths.get("a")).toBe(2);
    expect(depths.get("b")).toBe(2);
  });
});
