import { describe, expect, it } from "bun:test";
import {
  activeStickyMarkdownLineIndexes,
  applyStickyMarkdownEdit,
  parseStickyMarkdown,
  sourceOffsetToStickyMarkdownDomPosition,
  stickyMarkdownDomPositionToSourceOffset,
} from "../markdown-editing";

function roundTripEveryOffset(source: string): void {
  const document = parseStickyMarkdown(source);
  for (let offset = 0; offset <= source.length; offset += 1) {
    const position = sourceOffsetToStickyMarkdownDomPosition(document, offset);
    expect({
      offset,
      roundTrip: stickyMarkdownDomPositionToSourceOffset(document, position),
    }).toEqual({ offset, roundTrip: offset });
  }
}

describe("sticky markdown editing model", () => {
  it("tokenizes the closed D18 block and inline grammar", () => {
    const document = parseStickyMarkdown("# Heading\n- item with **bold** and `code`");

    expect(document.lines).toHaveLength(2);
    expect(document.lines[0].kind).toBe("heading");
    expect(document.lines[0].headingLevel).toBe(1);
    expect(document.lines[0].prefix?.text).toBe("# ");
    expect(document.lines[0].inline.map((token) => token.kind)).toEqual(["text"]);

    const bullet = document.lines[1];
    expect(bullet.kind).toBe("bullet");
    expect(bullet.prefix?.text).toBe("- ");
    expect(bullet.inline.map((token) => token.kind)).toEqual([
      "text",
      "strong",
      "text",
      "code",
    ]);
    expect(bullet.leaves.map((leaf) => leaf.text)).toEqual([
      "- ",
      "item with ",
      "**",
      "bold",
      "**",
      " and ",
      "`",
      "code",
      "`",
    ]);
  });

  it("leaves unpaired and incomplete markers as literal text", () => {
    const document = parseStickyMarkdown("**open\n`open\n****\n``");

    for (const line of document.lines) {
      expect(line.inline.map((token) => token.kind)).toEqual(["text"]);
      expect(line.leaves.some((leaf) => leaf.role === "marker")).toBe(false);
    }
    expect(document.lines.map((line) => line.inline[0]?.kind === "text" ? line.inline[0].leaf.text : "")).toEqual([
      "**open",
      "`open",
      "****",
      "``",
    ]);
  });

  it("round-trips source offsets through leaf positions across headings, bullets, bold, code, and blank lines", () => {
    const source = "# Heading\n- **bold** and `code`\n\nplain";
    roundTripEveryOffset(source);

    const document = parseStickyMarkdown(source);
    const boldContent = document.leaves.find((leaf) => leaf.text === "bold");
    const codeContent = document.leaves.find((leaf) => leaf.text === "code");
    const blankPlaceholder = document.lines[2].placeholder;

    expect(sourceOffsetToStickyMarkdownDomPosition(document, 0).leafKey).toBe("0:block");
    expect(sourceOffsetToStickyMarkdownDomPosition(document, source.indexOf("bold")).leafKey).toBe(
      boldContent?.key,
    );
    expect(sourceOffsetToStickyMarkdownDomPosition(document, source.indexOf("code")).leafKey).toBe(
      codeContent?.key,
    );
    expect(sourceOffsetToStickyMarkdownDomPosition(document, document.lines[2].sourceStart).leafKey).toBe(
      blankPlaceholder?.key,
    );
  });

  it("maps active marker-visibility lines from collapsed and ranged source selections", () => {
    const document = parseStickyMarkdown("# One\n- two\nthree");

    expect([...activeStickyMarkdownLineIndexes(document, { start: 2, end: 2 })]).toEqual([0]);
    expect([...activeStickyMarkdownLineIndexes(document, { start: 0, end: document.source.length })]).toEqual([
      0,
      1,
      2,
    ]);
    expect([...activeStickyMarkdownLineIndexes(document, { start: 6, end: 11 })]).toEqual([1]);
  });

  it("applies edits at marker boundaries in raw source coordinates", () => {
    expect(
      applyStickyMarkdownEdit("**bold**", { start: 2, end: 2 }, { type: "insertText", text: "!" }),
    ).toEqual({ source: "**!bold**", selection: { start: 3, end: 3 } });
    expect(
      applyStickyMarkdownEdit("**bold**", { start: 2, end: 2 }, { type: "deleteContentBackward" }),
    ).toEqual({ source: "*bold**", selection: { start: 1, end: 1 } });
    expect(
      applyStickyMarkdownEdit("`code`", { start: 5, end: 5 }, { type: "deleteContentForward" }),
    ).toEqual({ source: "`code", selection: { start: 5, end: 5 } });
    expect(
      applyStickyMarkdownEdit("# Heading", { start: 2, end: 2 }, { type: "insertText", text: "!" }),
    ).toEqual({ source: "# !Heading", selection: { start: 3, end: 3 } });
    expect(
      applyStickyMarkdownEdit("- item", { start: 2, end: 2 }, { type: "deleteContentBackward" }),
    ).toEqual({ source: "-item", selection: { start: 1, end: 1 } });
  });

  it("keeps blank lines addressable in source-position mapping", () => {
    const source = "a\n\nb\n";
    const document = parseStickyMarkdown(source);

    expect(document.lines).toHaveLength(4);
    expect(document.lines[1].placeholder?.text).toBe("\u00A0");
    expect(document.lines[3].placeholder?.sourceStart).toBe(source.length);
    roundTripEveryOffset(source);
  });

  it("implements sticky bullet continuation and empty-bullet exit on line break insertion", () => {
    expect(
      applyStickyMarkdownEdit("- item", { start: 6, end: 6 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "- item\n- ", selection: { start: 9, end: 9 } });
    expect(
      applyStickyMarkdownEdit("- ab", { start: 3, end: 3 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "- a\n- b", selection: { start: 6, end: 6 } });
    expect(
      applyStickyMarkdownEdit("- ", { start: 2, end: 2 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "", selection: { start: 0, end: 0 } });
    expect(
      applyStickyMarkdownEdit("a\n- ", { start: 4, end: 4 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "a\n", selection: { start: 2, end: 2 } });
  });

  it("normalizes pasted newlines while replacing the selected source range", () => {
    expect(
      applyStickyMarkdownEdit("hello **world**", { start: 6, end: 15 }, {
        type: "insertText",
        text: "one\r\ntwo",
      }),
    ).toEqual({ source: "hello one\ntwo", selection: { start: 13, end: 13 } });
  });
});

