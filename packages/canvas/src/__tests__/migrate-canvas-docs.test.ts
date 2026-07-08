import { describe, expect, it } from "bun:test";
import {
  legacyObjectColor,
  migrateConnectionColor,
  migrateDocument,
  migrateObjectColor,
  migrateSectionMembership,
  nearestCanvasColor,
} from "../../../../tools/migrate-canvas-docs/migrate";

/**
 * P1 migration transform (OBJECT-DEF-OVERHAUL.md §3.2, D10): legacy
 * tone/paletteToken/fill/stroke/tint/connector-hex → the nearest CanvasColor
 * swatch id, with the legacy fields deleted. Idempotent by construction —
 * a migrated object/connection carries none of the trigger fields.
 */

describe("migrate: nearestCanvasColor (hex → swatch id)", () => {
  it("maps the sampled bold hexes onto their own swatches (round-trip)", () => {
    expect(nearestCanvasColor("#F24822")).toBe("red");
    expect(nearestCanvasColor("#FF9E42")).toBe("orange");
    expect(nearestCanvasColor("#FFCD29")).toBe("yellow");
    expect(nearestCanvasColor("#14AE5C")).toBe("green");
    expect(nearestCanvasColor("#0D99FF")).toBe("blue");
    expect(nearestCanvasColor("#9747FF")).toBe("violet");
  });

  it("maps the pastel-pair fills onto the collapsed hue swatches", () => {
    expect(nearestCanvasColor("#FFC7C2")).toBe("red");
    expect(nearestCanvasColor("#FFE0C2")).toBe("orange");
    expect(nearestCanvasColor("#FFECBD")).toBe("yellow");
    expect(nearestCanvasColor("#DDF8E2")).toBe("green");
    expect(nearestCanvasColor("#C2E5FF")).toBe("blue");
    expect(nearestCanvasColor("#DCCCFF")).toBe("violet");
  });

  it("ladders achromatic hexes onto the neutral column by lightness", () => {
    expect(nearestCanvasColor("#FFFFFF")).toBe("white");
    expect(nearestCanvasColor("#F9F9F9")).toBe("white");
    expect(nearestCanvasColor("#E6E6E6")).toBe("gray");
    expect(nearestCanvasColor("#B3B3B3")).toBe("gray");
    expect(nearestCanvasColor("#757575")).toBe("gray");
  });

  it("maps the sampled connector hexes onto picks whose connector cells round-trip", () => {
    expect(nearestCanvasColor("#EB7500")).toBe("orange");
    expect(nearestCanvasColor("#3E9B4B")).toBe("green");
    expect(nearestCanvasColor("#E8A302")).toBe("yellow");
  });

  it("falls back to gray for unparsable input", () => {
    expect(nearestCanvasColor("not-a-hex")).toBe("gray");
  });
});

describe("migrate: legacy object color resolution (§3.2 precedence)", () => {
  it("explicit fill wins over stroke, tint, token, and tone", () => {
    expect(
      legacyObjectColor({
        tint: "green",
        style: { fill: "#C2E5FF", stroke: "#F24822", paletteToken: "hot", tone: "memory" },
      }),
    ).toBe("blue");
  });

  it("stroke-only objects match on the stroke hex", () => {
    expect(legacyObjectColor({ style: { stroke: "#757575" } })).toBe("gray");
  });

  it("section tint names map to the same hue swatch (purple → violet)", () => {
    expect(legacyObjectColor({ type: "section", tint: "green" })).toBe("green");
    expect(legacyObjectColor({ type: "section", tint: "purple" })).toBe("violet");
    expect(legacyObjectColor({ type: "section", tint: "gray" })).toBe("gray");
    expect(legacyObjectColor({ type: "section", tint: "white" })).toBe("white");
    expect(legacyObjectColor({ type: "section", tint: "teal" })).toBe("teal");
  });

  it("palette tokens map to hue swatches on shapes and classic sticky hues on stickies", () => {
    expect(legacyObjectColor({ style: { paletteToken: "memory" } })).toBe("violet");
    expect(legacyObjectColor({ style: { paletteToken: "process" } })).toBe("blue");
    // Stickies rendered tokens as the exact classic sticky hexes (old
    // STICKY_TOKEN_FILL): note→yellow, hot→red(salmon), memory→pink.
    expect(legacyObjectColor({ type: "sticky", style: { paletteToken: "note" } })).toBe("yellow");
    expect(legacyObjectColor({ type: "sticky", style: { paletteToken: "hot" } })).toBe("red");
    expect(legacyObjectColor({ type: "sticky", style: { paletteToken: "memory" } })).toBe("pink");
  });

  it("tones map to hue swatches; a sticky's default 'warning' maps to the classic yellow", () => {
    expect(legacyObjectColor({ style: { tone: "neutral" } })).toBe("gray");
    expect(legacyObjectColor({ style: { tone: "input" } })).toBe("green");
    expect(legacyObjectColor({ style: { tone: "memory" } })).toBe("violet");
    expect(legacyObjectColor({ style: { tone: "warning" } })).toBe("red");
    expect(legacyObjectColor({ type: "sticky", style: { tone: "warning" } })).toBe("yellow");
  });
});

describe("migrate: object color transform", () => {
  it("stamps `color` and deletes every legacy field", () => {
    const migrated = migrateObjectColor({
      id: "o1",
      type: "process",
      text: "Hello",
      geometry: { x: 0, y: 0, width: 100, height: 100 },
      style: { shape: "rounded-rect", tone: "input", paletteToken: "process", strokeWidth: 8 },
    });
    expect(migrated).toEqual({
      id: "o1",
      type: "process",
      text: "Hello",
      color: "blue",
      geometry: { x: 0, y: 0, width: 100, height: 100 },
      style: { shape: "rounded-rect", strokeWidth: 8 },
    });
  });

  it("drops an emptied style bag and the section tint field", () => {
    const migrated = migrateObjectColor({
      id: "s1",
      type: "section",
      text: "Section",
      tint: "blue",
      geometry: { x: 0, y: 0, width: 100, height: 100 },
      style: { tone: "neutral" },
    });
    expect(migrated).toEqual({
      id: "s1",
      type: "section",
      text: "Section",
      color: "blue",
      geometry: { x: 0, y: 0, width: 100, height: 100 },
    });
  });

  it("is a no-op (null) for already-migrated objects", () => {
    expect(
      migrateObjectColor({
        id: "o1",
        type: "process",
        text: "Hello",
        color: "blue",
        geometry: { x: 0, y: 0, width: 100, height: 100 },
        style: { shape: "rounded-rect" },
      }),
    ).toBeNull();
  });

  it("normalizes already-migrated legacy soft object colors to bare hues", () => {
    expect(
      migrateObjectColor({
        id: "o1",
        type: "process",
        text: "Hello",
        color: "green-soft",
        geometry: { x: 0, y: 0, width: 100, height: 100 },
        style: { shape: "rounded-rect" },
      }),
    ).toEqual({
      id: "o1",
      type: "process",
      text: "Hello",
      color: "green",
      geometry: { x: 0, y: 0, width: 100, height: 100 },
      style: { shape: "rounded-rect" },
    });
  });
});

describe("migrate: connection color transform", () => {
  it("maps legacy raw hexes to swatch ids", () => {
    expect(migrateConnectionColor({ id: "c1", color: "#EB7500" })).toEqual({
      id: "c1",
      color: "orange",
    });
  });

  it("is a no-op (null) for swatch ids and absent colors", () => {
    expect(migrateConnectionColor({ id: "c1", color: "orange" })).toBeNull();
    expect(migrateConnectionColor({ id: "c1" })).toBeNull();
  });

  it("normalizes already-migrated legacy soft connection colors to bare hues", () => {
    expect(migrateConnectionColor({ id: "c1", color: "orange-soft" })).toEqual({
      id: "c1",
      color: "orange",
    });
  });
});

describe("migrate: section membership transform", () => {
  const staleDoc = {
    schemaVersion: 1,
    id: "doc",
    mode: "diagram",
    objects: [
      {
        id: "outer",
        type: "section",
        text: "Outer",
        parentId: null,
        geometry: { x: 0, y: 0, width: 500, height: 500 },
      },
      {
        id: "inner",
        type: "section",
        text: "Inner",
        parentId: null,
        geometry: { x: 50, y: 50, width: 300, height: 300 },
      },
      {
        id: "card",
        type: "process",
        text: "Card",
        parentId: "outer",
        geometry: { x: 80, y: 80, width: 100, height: 100 },
      },
      {
        id: "outside",
        type: "process",
        text: "Outside",
        parentId: "outer",
        geometry: { x: 600, y: 600, width: 100, height: 100 },
      },
    ],
    connections: [],
  };

  it("recomputes every object parentId from geometry", () => {
    const migrated = migrateSectionMembership(staleDoc);

    expect(migrated.migrated).toBe(3);
    expect((migrated.doc.objects as Array<Record<string, unknown>>).map(({ id, parentId }) => [id, parentId])).toEqual([
      ["outer", null],
      ["inner", "outer"],
      ["card", "inner"],
      ["outside", null],
    ]);
  });

  it("counts absent root parentId as a migration to explicit null", () => {
    const doc = {
      schemaVersion: 1,
      id: "doc",
      mode: "diagram",
      objects: [
        {
          id: "root",
          type: "process",
          text: "Root",
          geometry: { x: 0, y: 0, width: 100, height: 100 },
        },
      ],
      connections: [],
    };

    const migrated = migrateSectionMembership(doc);

    expect(migrated.migrated).toBe(1);
    expect((migrated.doc.objects as Array<Record<string, unknown>>)[0]).toEqual({
      id: "root",
      type: "process",
      text: "Root",
      parentId: null,
      geometry: { x: 0, y: 0, width: 100, height: 100 },
    });
  });

  it("is idempotent after the first run", () => {
    const first = migrateSectionMembership(staleDoc);
    const second = migrateSectionMembership(first.doc);

    expect(second.migrated).toBe(0);
    expect(second.doc).toEqual(first.doc);
  });
});

describe("migrate: document-level idempotency", () => {
  const legacyDoc = {
    schemaVersion: 1,
    id: "doc",
    mode: "diagram",
    objects: [
      {
        id: "o1",
        type: "sticky",
        label: "old label",
        body: "note body",
        geometry: { x: 0, y: 0, width: 100, height: 100 },
        style: { shape: "note", tone: "warning" },
      },
    ],
    connections: [
      { id: "c1", from: { objectId: "o1" }, to: { objectId: "o1" }, color: "#9747FF" },
    ],
  };

  it("migrates text + color in one pass, then re-running is a no-op", () => {
    const first = migrateDocument(legacyDoc);
    expect(first.migrated).toBe(3);
    const object = first.doc.objects as Array<Record<string, unknown>>;
    expect(object[0]).toEqual({
      id: "o1",
      type: "sticky",
      text: "note body",
      color: "yellow",
      parentId: null,
      geometry: { x: 0, y: 0, width: 100, height: 100 },
      style: { shape: "note" },
    });
    expect((first.doc.connections as Array<Record<string, unknown>>)[0]!.color).toBe("violet");

    const second = migrateDocument(first.doc);
    expect(second.migrated).toBe(0);
    expect(second.doc).toEqual(first.doc);
  });
});
