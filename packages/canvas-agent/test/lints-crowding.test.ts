import { describe, expect, test } from "bun:test";

import { rule as crowding } from "../src/board/lints/rules/crowding";
import { box, makeDocument } from "./synthetic";

describe("crowding lint", () => {
  test("declares its faces", () => {
    expect(crowding.id).toBe("crowding");
    expect(crowding.tier).toBe("warning");
    expect(crowding.guidance).toContain("corridor");
  });

  test("side-by-side siblings 8px apart produce one warning", () => {
    const findings = crowding.check(makeDocument([
      box("a", 0, 0),
      box("b", 168, 0),
    ]));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "crowding",
      severity: "warning",
      at: ["a", "b"],
      where: { x: 0, y: 0, width: 328, height: 96 },
    });
    expect(findings[0]!.message).toContain("8px");
    expect(findings[0]!.message).toContain("≥16px");
  });

  test("unused 20px gaps do not require speculative routing corridors", () => {
    expect(crowding.check(makeDocument([box("a", 0, 0), box("b", 180, 0)]))).toHaveLength(0);
    expect(crowding.check(makeDocument([box("a", 0, 0), box("b", 0, 116)]))).toHaveLength(0);
  });

  test("touching siblings remain a finding", () => {
    expect(crowding.check(makeDocument([box("a", 0, 0), box("b", 160, 0)]))).toHaveLength(1);
  });

  test("side-by-side siblings with an ample gap are clean", () => {
    const findings = crowding.check(makeDocument([
      box("a", 0, 0),
      box("b", 320, 0),
    ]));

    expect(findings).toHaveLength(0);
  });

  test("stacked siblings 8px apart produce one warning", () => {
    const findings = crowding.check(makeDocument([
      box("a", 0, 0),
      box("b", 0, 104),
    ]));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "crowding",
      severity: "warning",
      at: ["a", "b"],
      where: { x: 0, y: 0, width: 160, height: 200 },
    });
    expect(findings[0]!.message).toContain("8px");
    expect(findings[0]!.message).toContain("≥16px");
  });

  test("stacked siblings with an ample gap are clean", () => {
    const findings = crowding.check(makeDocument([
      box("a", 0, 0),
      box("b", 0, 192),
    ]));

    expect(findings).toHaveLength(0);
  });

  test("a diagonal pair is clean", () => {
    const findings = crowding.check(makeDocument([
      box("a", 0, 0),
      box("b", 320, 200),
    ]));

    expect(findings).toHaveLength(0);
  });

  test("a truly overlapping pair is clean", () => {
    const findings = crowding.check(makeDocument([
      box("a", 0, 0),
      box("b", 40, 20),
    ]));

    expect(findings).toHaveLength(0);
  });

  test("non-sibling nodes are not paired", () => {
    const findings = crowding.check(makeDocument([
      { ...box("a", 0, 0), parentId: "p" },
      { ...box("b", 44, 0), parentId: "q" },
    ]));

    expect(findings).toHaveLength(0);
  });

  test("a section frame and its node child produce no finding", () => {
    const findings = crowding.check(makeDocument([
      box("sec", 0, 0, 480, 320, "section"),
      { ...box("child", 0, 0), parentId: "sec" },
    ]));

    expect(findings).toHaveLength(0);
  });

  test("stickies are ignored", () => {
    const findings = crowding.check(makeDocument([
      box("a", 0, 0),
      box("note", 44, 0, 160, 96, "sticky"),
    ]));

    expect(findings).toHaveLength(0);
  });
});
