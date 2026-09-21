import { describe, expect, test } from "bun:test";
import { getCanvasAuthoringGuidance } from "../src/authoring";
import { OBJECT_PREFERENCES } from "../../canvas/src/objects/registry";

describe("shared Canvas authoring guidance", () => {
  test("registry color changes reach the reference and change its snapshot identity", () => {
    const entry = OBJECT_PREFERENCES[0]!;
    const before = getCanvasAuthoringGuidance();
    const original = entry.color;
    try {
      // Model the registry editor supplying a different shared default.
      (entry as { color: string }).color = original === "blue" ? "red" : "blue";
      const after = getCanvasAuthoringGuidance();
      expect(after.snapshotId).not.toBe(before.snapshotId);
      const catalog = after.topics.find(topic => topic.id === "visual_vocabulary")!.text;
      expect(catalog).toContain(`- ${entry.name} (${entry.color})`);
    } finally {
      (entry as { color: string }).color = original;
    }
    expect(getCanvasAuthoringGuidance().snapshotId).toBe(before.snapshotId);
  });
});
