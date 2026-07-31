import { describe, expect, test } from "bun:test";

import { FIRST_USE_COLORS } from "@codecaine-ai/canvas/actions";

import {
  CREATION_DEFAULTS,
  creationDefaultFor,
  creationKindFor,
} from "../src/service/session/tools/creation-defaults";
import { AGENT_GRID } from "../src/service/session/tools/grid";

describe("creation defaults (D5)", () => {
  test("every size in the table is a multiple of the agent grid", () => {
    for (const [kind, row] of Object.entries(CREATION_DEFAULTS)) {
      expect(`${kind}.width % ${AGENT_GRID} = ${row.size.width % AGENT_GRID}`).toBe(
        `${kind}.width % ${AGENT_GRID} = 0`,
      );
      expect(`${kind}.height % ${AGENT_GRID} = ${row.size.height % AGENT_GRID}`).toBe(
        `${kind}.height % ${AGENT_GRID} = 0`,
      );
      expect(row.size.width).toBeGreaterThan(0);
      expect(row.size.height).toBeGreaterThan(0);
    }
  });

  test("the landed table is the one the plan specifies", () => {
    expect(CREATION_DEFAULTS).toEqual({
      // craft targets 288×96, rounded to the 20 grid
      shape: { size: { width: 280, height: 100 }, color: "gray" },
      // UI default 176×128, rounded to the 20 grid
      sticky: { size: { width: 180, height: 120 }, color: "yellow" },
      // UI default 480×360, already on the grid
      section: { size: { width: 480, height: 360 }, color: "gray" },
      // UI default 120×120, already on the grid
      icon: { size: { width: 120, height: 120 }, color: "gray" },
    });
  });

  test("colors are the canvas package's per-kind first-use fallbacks", () => {
    expect(CREATION_DEFAULTS.shape.color).toBe(FIRST_USE_COLORS.shape);
    expect(CREATION_DEFAULTS.sticky.color).toBe(FIRST_USE_COLORS.sticky);
    expect(CREATION_DEFAULTS.section.color).toBe(FIRST_USE_COLORS.section);
    // Icons read the "shape" bucket — only sticky and section have their own.
    expect(CREATION_DEFAULTS.icon.color).toBe(FIRST_USE_COLORS.shape);
  });

  test("folded type names resolve to their kind", () => {
    expect(creationKindFor("process")).toBe("shape");
    expect(creationKindFor("diamond" as string)).toBe("shape");
    expect(creationKindFor("memory")).toBe("icon");
    expect(creationKindFor("section")).toBe("section");
    expect(creationKindFor("sticky")).toBe("sticky");
    expect(creationKindFor("icon")).toBe("icon");
    // Unknown names fall back to the shape row rather than throwing.
    expect(creationKindFor("not-a-type")).toBe("shape");
  });

  test("creationDefaultFor reads the kind row, with the registry's preferred color", () => {
    // `process` prefers gray — the registry pick and the kind row agree.
    expect(creationDefaultFor("process")).toEqual(CREATION_DEFAULTS.shape);
    // A glyph takes the icon SIZE row but its own registry color: memory is blue.
    expect(creationDefaultFor("memory")).toEqual({
      size: CREATION_DEFAULTS.icon.size,
      color: "blue",
    });
    // Names outside the registry keep the kind row untouched.
    expect(creationDefaultFor("sticky")).toEqual(CREATION_DEFAULTS.sticky);
  });
});
