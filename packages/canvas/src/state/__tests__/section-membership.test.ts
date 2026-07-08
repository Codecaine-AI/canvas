import { describe, expect, it } from "bun:test";
import {
  reconcileSectionMembership,
  resolveSectionParent,
} from "../section-membership";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../schema";

function makeObject(
  overrides: Partial<InteractiveCanvasObject> & { id: string },
): InteractiveCanvasObject {
  return {
    id: overrides.id,
    type: "process",
    text: overrides.id,
    parentId: null,
    geometry: { x: 0, y: 0, width: 100, height: 100 },
    ...overrides,
  };
}

function makeSection(
  overrides: Partial<InteractiveCanvasObject> & { id: string },
): InteractiveCanvasObject {
  return makeObject({
    type: "section",
    text: overrides.id,
    color: "gray",
    ...overrides,
  });
}

function makeDocument(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return {
    schemaVersion: 1,
    id: "section-membership-test",
    mode: "diagram",
    objects,
    connections: [],
  };
}

function objectById(document: InteractiveCanvasDocument, objectId: string): InteractiveCanvasObject {
  const object = document.objects.find((candidate) => candidate.id === objectId);
  if (!object) throw new Error(`Missing object ${objectId}`);
  return object;
}

describe("section membership resolver", () => {
  it("chooses the smallest qualifying container for nested sections", () => {
    const outer = makeSection({
      id: "outer",
      geometry: { x: 0, y: 0, width: 500, height: 500 },
    });
    const inner = makeSection({
      id: "inner",
      geometry: { x: 50, y: 50, width: 240, height: 240 },
    });
    const card = makeObject({
      id: "card",
      geometry: { x: 90, y: 90, width: 80, height: 80 },
    });
    const document = makeDocument([outer, inner, card]);

    expect(resolveSectionParent(card, document)).toBe("inner");
    expect(resolveSectionParent(inner, document)).toBe("outer");
    expect(resolveSectionParent(card, document, new Set(["inner"]))).toBe("outer");
  });

  it("does not let a smaller overlapping section adopt a larger section", () => {
    const pageFrame = makeSection({
      id: "page-frame",
      geometry: { x: 687, y: 434, width: 4896, height: 2032 },
    });
    const flowFrame = makeSection({
      id: "flow-frame",
      geometry: { x: 1926, y: 504, width: 3529, height: 1909 },
    });
    const nestedFrame = makeSection({
      id: "nested-frame",
      geometry: { x: 2100, y: 700, width: 700, height: 420 },
    });
    const document = makeDocument([pageFrame, flowFrame, nestedFrame]);

    expect(resolveSectionParent(pageFrame, document)).toBeNull();
    expect(resolveSectionParent(nestedFrame, document)).toBe("flow-frame");

    const reconciled = reconcileSectionMembership(document);
    expect(objectById(reconciled, "page-frame").parentId).toBeNull();
    expect(objectById(reconciled, "nested-frame").parentId).toBe("flow-frame");
  });

  it("requires at least 60 percent overlap of the object's own area", () => {
    const section = makeSection({
      id: "section",
      geometry: { x: 0, y: 0, width: 200, height: 100 },
    });
    const belowThreshold = makeObject({
      id: "below-threshold",
      geometry: { x: 141, y: 0, width: 100, height: 100 },
    });
    const exactThreshold = makeObject({
      id: "exact-threshold",
      geometry: { x: 140, y: 0, width: 100, height: 100 },
    });
    const document = makeDocument([section, belowThreshold, exactThreshold]);

    expect(resolveSectionParent(belowThreshold, document)).toBeNull();
    expect(resolveSectionParent(exactThreshold, document)).toBe("section");
  });

  it("respects locked section adoption rules", () => {
    const lockedAll = makeSection({
      id: "locked-all",
      locked: "all",
      geometry: { x: 0, y: 0, width: 200, height: 200 },
    });
    const lockedAllChild = makeObject({
      id: "locked-all-child",
      geometry: { x: 40, y: 40, width: 80, height: 80 },
    });
    const lockedBackground = makeSection({
      id: "locked-background",
      locked: "background",
      geometry: { x: 300, y: 0, width: 200, height: 200 },
    });
    const lockedBackgroundChild = makeObject({
      id: "locked-background-child",
      geometry: { x: 340, y: 40, width: 80, height: 80 },
    });
    const document = makeDocument([
      lockedAll,
      lockedAllChild,
      lockedBackground,
      lockedBackgroundChild,
    ]);

    expect(resolveSectionParent(lockedAllChild, document)).toBeNull();
    expect(resolveSectionParent(lockedBackgroundChild, document)).toBe("locked-background");
  });
});

describe("section membership reconciliation", () => {
  it("retains locked-all section children across reconcile", () => {
    const locked = makeSection({
      id: "locked",
      locked: "all",
      geometry: { x: 0, y: 0, width: 240, height: 240 },
    });
    const child = makeObject({
      id: "child",
      parentId: "locked",
      geometry: { x: 40, y: 40, width: 80, height: 80 },
    });
    const document = makeDocument([locked, child]);

    const reconciled = reconcileSectionMembership(document);

    expect(objectById(reconciled, "child").parentId).toBe("locked");
  });

  it("releases a retained child when its geometry no longer qualifies", () => {
    const section = makeSection({
      id: "section",
      geometry: { x: 0, y: 0, width: 240, height: 240 },
    });
    const movedAway = makeObject({
      id: "moved-away",
      parentId: "section",
      geometry: { x: 400, y: 40, width: 80, height: 80 },
    });
    const tooLarge = makeObject({
      id: "too-large",
      parentId: "section",
      geometry: { x: 20, y: 20, width: 260, height: 260 },
    });
    const document = makeDocument([section, movedAway, tooLarge]);

    const reconciled = reconcileSectionMembership(document);

    expect(objectById(reconciled, "moved-away").parentId).toBeNull();
    expect(objectById(reconciled, "too-large").parentId).toBeNull();
  });

  it("reassigns stale stored parents to a qualifying ancestor or null", () => {
    const outer = makeSection({
      id: "outer",
      geometry: { x: 0, y: 0, width: 500, height: 500 },
    });
    const inner = makeSection({
      id: "inner",
      parentId: "outer",
      geometry: { x: 50, y: 50, width: 160, height: 160 },
    });
    const ancestorRelease = makeObject({
      id: "ancestor-release",
      parentId: "inner",
      geometry: { x: 330, y: 80, width: 80, height: 80 },
    });
    const nullRelease = makeObject({
      id: "null-release",
      parentId: "inner",
      geometry: { x: 700, y: 80, width: 80, height: 80 },
    });
    const document = makeDocument([outer, inner, ancestorRelease, nullRelease]);

    const reconciled = reconcileSectionMembership(document);

    expect(objectById(reconciled, "ancestor-release").parentId).toBe("outer");
    expect(objectById(reconciled, "null-release").parentId).toBeNull();
  });

  it("returns the same document reference when membership is already correct", () => {
    const document = makeDocument([
      makeSection({
        id: "outer",
        parentId: null,
        geometry: { x: 0, y: 0, width: 500, height: 500 },
      }),
      makeSection({
        id: "inner",
        parentId: "outer",
        geometry: { x: 50, y: 50, width: 180, height: 180 },
      }),
      makeObject({
        id: "card",
        parentId: "inner",
        geometry: { x: 80, y: 80, width: 80, height: 80 },
      }),
    ]);

    expect(reconcileSectionMembership(document)).toBe(document);
  });

  it("is idempotent and only replaces changed objects", () => {
    const outer = makeSection({
      id: "outer",
      parentId: null,
      geometry: { x: 0, y: 0, width: 500, height: 500 },
    });
    const inner = makeSection({
      id: "inner",
      parentId: null,
      geometry: { x: 50, y: 50, width: 180, height: 180 },
    });
    const card = makeObject({
      id: "card",
      parentId: "outer",
      geometry: { x: 80, y: 80, width: 80, height: 80 },
    });
    const document = makeDocument([outer, inner, card]);

    const reconciled = reconcileSectionMembership(document);
    expect(reconciled).not.toBe(document);
    expect(reconcileSectionMembership(reconciled)).toBe(reconciled);

    expect(reconciled.objects[0]).toBe(outer);
    expect(reconciled.objects[1]).not.toBe(inner);
    expect(reconciled.objects[2]).not.toBe(card);
    expect(objectById(reconciled, "inner").parentId).toBe("outer");
    expect(objectById(reconciled, "card").parentId).toBe("inner");
  });
});
