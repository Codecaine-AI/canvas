/**
 * Connection `labelPosition` at the validation load boundary (S1.1).
 *
 * The field's real risk is not its parser but the connection loop's
 * WHITELIST re-builder — it constructs a fresh object literal, so a field
 * missing there is silently eaten on every single load no matter what the
 * type declares. The round-trip cases below are that guard.
 *
 * Parsing follows the soft-validation precedent (`color`,
 * `style.strokeWidth`): malformed input warns and drops rather than failing
 * the document, because the fallback — the routed midpoint — is the behavior
 * every board already had.
 */
import { describe, expect, it } from "bun:test";

import { validateInteractiveCanvasDocument } from "../schema";

function documentWith(labelPosition: unknown) {
  return {
    schemaVersion: 1,
    id: "label-position-doc",
    mode: "diagram",
    objects: [
      { id: "a", type: "process", text: "A", geometry: { x: 0, y: 0, width: 100, height: 60 } },
      { id: "b", type: "process", text: "B", geometry: { x: 300, y: 0, width: 100, height: 60 } },
    ],
    connections: [
      {
        id: "a-to-b",
        from: { objectId: "a", anchor: "right" },
        to: { objectId: "b", anchor: "left" },
        label: "chip",
        ...(labelPosition === undefined ? {} : { labelPosition }),
      },
    ],
  };
}

function loadConnection(labelPosition: unknown) {
  const result = validateInteractiveCanvasDocument(documentWith(labelPosition));
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("document unexpectedly rejected");
  return result;
}

describe("schema — connection labelPosition", () => {
  it("survives the connection whitelist re-builder (along + offset)", () => {
    const result = loadConnection({ along: 0.25, offset: -18 });
    expect(result.document.connections[0]?.labelPosition).toEqual({ along: 0.25, offset: -18 });
    expect(result.warnings).toBeUndefined();
  });

  it("round-trips a bare `along` without inventing an offset", () => {
    const result = loadConnection({ along: 0.75 });
    expect(result.document.connections[0]?.labelPosition).toEqual({ along: 0.75 });
    expect(result.document.connections[0]?.labelPosition?.offset).toBeUndefined();
  });

  it("accepts both endpoints of the range", () => {
    expect(loadConnection({ along: 0 }).document.connections[0]?.labelPosition).toEqual({ along: 0 });
    expect(loadConnection({ along: 1 }).document.connections[0]?.labelPosition).toEqual({ along: 1 });
  });

  it("stays absent when absent — the midpoint default is not materialized", () => {
    const result = loadConnection(undefined);
    expect(result.document.connections[0]?.labelPosition).toBeUndefined();
  });

  it("survives a full re-validate (idempotent load)", () => {
    const once = loadConnection({ along: 0.4, offset: 12 });
    const twice = validateInteractiveCanvasDocument(JSON.parse(JSON.stringify(once.document)));
    expect(twice.ok).toBe(true);
    if (!twice.ok) return;
    expect(twice.document.connections[0]?.labelPosition).toEqual({ along: 0.4, offset: 12 });
  });

  it("warns and drops an out-of-range `along` rather than clamping it", () => {
    for (const along of [-0.1, 1.5, 42]) {
      const result = loadConnection({ along });
      expect(result.document.connections[0]?.labelPosition).toBeUndefined();
      expect(result.warnings?.some((w) => w.path.endsWith("labelPosition.along"))).toBe(true);
    }
  });

  it("warns and drops a non-numeric or missing `along`", () => {
    for (const value of [{ along: "0.5" }, { along: Number.NaN }, { offset: 12 }, {}]) {
      const result = loadConnection(value);
      expect(result.document.connections[0]?.labelPosition).toBeUndefined();
      expect(result.warnings?.length).toBeGreaterThan(0);
    }
  });

  it("warns and drops a non-object labelPosition", () => {
    for (const value of [0.5, "0.5", [0.5], null]) {
      const result = loadConnection(value);
      expect(result.document.connections[0]?.labelPosition).toBeUndefined();
      expect(result.warnings?.some((w) => w.path.endsWith("labelPosition"))).toBe(true);
    }
  });

  it("drops only a malformed `offset`, keeping a valid `along`", () => {
    const result = loadConnection({ along: 0.6, offset: "nope" });
    expect(result.document.connections[0]?.labelPosition).toEqual({ along: 0.6 });
    expect(result.warnings?.some((w) => w.path.endsWith("labelPosition.offset"))).toBe(true);
  });

  it("keeps a malformed pin non-fatal — the rest of the connection loads", () => {
    const result = loadConnection({ along: 9 });
    expect(result.document.connections[0]?.id).toBe("a-to-b");
    expect(result.document.connections[0]?.label).toBe("chip");
  });
});
