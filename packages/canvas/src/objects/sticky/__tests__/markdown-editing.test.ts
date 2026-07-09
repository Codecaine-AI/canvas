import { describe, expect, it } from "bun:test";
import {
  activeStickyMarkdownLineIndexes,
  applyStickyMarkdownEdit,
  applyStickyMarkdownIndent,
  normalizeStickyMarkdownCaret,
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
    expect(document.lines[0].depth).toBe(0);
    expect(document.lines[0].prefix?.text).toBe("# ");
    expect(document.lines[0].inline.map((token) => token.kind)).toEqual(["text"]);

    const bullet = document.lines[1];
    expect(bullet.kind).toBe("bullet");
    expect(bullet.depth).toBe(0);
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

  it("parses paired-space structural depth for every line kind", () => {
    const heading = parseStickyMarkdown("  # h").lines[0];
    expect(heading.kind).toBe("heading");
    expect(heading.depth).toBe(1);
    expect(heading.prefix?.text).toBe("  # ");
    expect(heading.contentStart).toBe(4);

    const oneDeep = parseStickyMarkdown("  - a").lines[0];
    expect(oneDeep.kind).toBe("bullet");
    expect(oneDeep.depth).toBe(1);
    expect(oneDeep.prefix?.text).toBe("  - ");
    expect(oneDeep.contentStart).toBe(4);

    const twoDeep = parseStickyMarkdown("    - a").lines[0];
    expect(twoDeep.kind).toBe("bullet");
    expect(twoDeep.depth).toBe(2);
    expect(twoDeep.prefix?.text).toBe("    - ");
    expect(twoDeep.contentStart).toBe(6);

    // The odd third space is hidden with the pair — visible ink always starts
    // exactly on a depth column, never a stray half-step right of it.
    const paragraph = parseStickyMarkdown("   x").lines[0];
    expect(paragraph.kind).toBe("text");
    expect(paragraph.depth).toBe(1);
    expect(paragraph.prefix?.markerKind).toBe("indent-prefix");
    expect(paragraph.prefix?.text).toBe("   ");
    expect(paragraph.contentStart).toBe(3);
    expect(paragraph.inline[0]?.kind === "text" ? paragraph.inline[0].leaf.text : "").toBe("x");

    const emptyIndented = parseStickyMarkdown("  ").lines[0];
    expect(emptyIndented.kind).toBe("text");
    expect(emptyIndented.depth).toBe(1);
    expect(emptyIndented.prefix?.text).toBe("  ");
    expect(emptyIndented.placeholder?.sourceStart).toBe(2);

    // Markers parse after ANY leading spaces (the odd space hides with the
    // marker prefix) — " - a" is a depth-0 bullet, not literal text.
    const oddLeadingSpace = parseStickyMarkdown(" - a").lines[0];
    expect(oddLeadingSpace.kind).toBe("bullet");
    expect(oddLeadingSpace.depth).toBe(0);
    expect(oddLeadingSpace.prefix?.text).toBe(" - ");
    expect(oddLeadingSpace.contentStart).toBe(3);

    const deepBullet = parseStickyMarkdown("            - deep").lines[0];
    expect(deepBullet.kind).toBe("bullet");
    expect(deepBullet.depth).toBe(6);
    expect(deepBullet.prefix?.text).toBe("            - ");

    roundTripEveryOffset("  - a\n  # Heading\n    - **bold** and `code`\n   x\n  \n - odd");
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
    const source = "  # Heading\n  - **bold** and `code`\n  \n  plain";
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
    expect(sourceOffsetToStickyMarkdownDomPosition(document, document.lines[2].contentStart).leafKey).toBe(
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
    ).toEqual({ source: "item", selection: { start: 0, end: 0 } });
    expect(
      applyStickyMarkdownEdit("# Heading", { start: 2, end: 2 }, { type: "deleteContentBackward" }),
    ).toEqual({ source: "Heading", selection: { start: 0, end: 0 } });
    expect(
      applyStickyMarkdownEdit("  plain", { start: 2, end: 2 }, { type: "deleteContentBackward" }),
    ).toEqual({ source: "plain", selection: { start: 0, end: 0 } });
    expect(
      applyStickyMarkdownEdit("  # Heading", { start: 4, end: 4 }, {
        type: "deleteContentBackward",
      }),
    ).toEqual({ source: "# Heading", selection: { start: 2, end: 2 } });
    expect(
      applyStickyMarkdownEdit("  - item", { start: 4, end: 4 }, { type: "deleteContentBackward" }),
    ).toEqual({ source: "- item", selection: { start: 2, end: 2 } });
    expect(
      applyStickyMarkdownEdit("- item", { start: 4, end: 4 }, { type: "deleteContentBackward" }),
    ).toEqual({ source: "- iem", selection: { start: 3, end: 3 } });
  });

  it("normalizes collapsed carets away from hidden prefix leaves", () => {
    const document = parseStickyMarkdown("plain\n  text\n- item\n  # Heading\n    - child\n  ");
    const textLine = document.lines[1];
    const bulletLine = document.lines[2];
    const headingLine = document.lines[3];
    const childLine = document.lines[4];
    const blankLine = document.lines[5];

    expect(normalizeStickyMarkdownCaret(document, textLine.sourceStart, 0)).toBe(
      textLine.contentStart,
    );
    expect(normalizeStickyMarkdownCaret(document, textLine.sourceStart + 1, 1)).toBe(
      textLine.contentStart,
    );
    expect(normalizeStickyMarkdownCaret(document, textLine.sourceStart + 1, -1)).toBe(
      document.lines[0].sourceEnd,
    );
    expect(normalizeStickyMarkdownCaret(parseStickyMarkdown("- item"), 0, -1)).toBe(2);
    expect(normalizeStickyMarkdownCaret(document, bulletLine.sourceStart, 0)).toBe(
      bulletLine.contentStart,
    );
    expect(normalizeStickyMarkdownCaret(document, headingLine.sourceStart, 0)).toBe(
      headingLine.contentStart,
    );
    expect(normalizeStickyMarkdownCaret(document, childLine.sourceStart + 2, 0)).toBe(
      childLine.contentStart,
    );
    expect(normalizeStickyMarkdownCaret(document, blankLine.sourceStart, 0)).toBe(
      blankLine.contentStart,
    );
    expect(normalizeStickyMarkdownCaret(document, textLine.contentStart, 0)).toBe(
      textLine.contentStart,
    );
    expect(normalizeStickyMarkdownCaret(document, document.source.length, 0)).toBe(document.source.length);
  });

  it("keeps blank lines addressable in source-position mapping", () => {
    const source = "a\n\nb\n";
    const document = parseStickyMarkdown(source);

    expect(document.lines).toHaveLength(4);
    expect(document.lines[1].placeholder?.text).toBe("\u00A0");
    expect(document.lines[3].placeholder?.sourceStart).toBe(source.length);
    roundTripEveryOffset(source);
  });

  it("implements depth-preserving line breaks and empty-prefix exits", () => {
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
    expect(
      applyStickyMarkdownEdit("  - a", { start: 5, end: 5 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "  - a\n  - ", selection: { start: 10, end: 10 } });
    expect(
      applyStickyMarkdownEdit("  - ", { start: 4, end: 4 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "- ", selection: { start: 2, end: 2 } });
    expect(
      applyStickyMarkdownEdit("  ab", { start: 4, end: 4 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "  ab\n  ", selection: { start: 7, end: 7 } });
    expect(
      applyStickyMarkdownEdit("  ab", { start: 3, end: 3 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "  a\n  b", selection: { start: 6, end: 6 } });
    expect(
      applyStickyMarkdownEdit("  # ab", { start: 5, end: 5 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "  # a\n  b", selection: { start: 8, end: 8 } });
    expect(
      applyStickyMarkdownEdit("  ", { start: 2, end: 2 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "", selection: { start: 0, end: 0 } });
    expect(
      applyStickyMarkdownEdit("  # ", { start: 4, end: 4 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "# ", selection: { start: 2, end: 2 } });
    expect(
      applyStickyMarkdownEdit("# ", { start: 2, end: 2 }, { type: "insertLineBreak" }),
    ).toEqual({ source: "", selection: { start: 0, end: 0 } });
  });

  it("applies sticky markdown indentation in source coordinates", () => {
    expect(applyStickyMarkdownIndent("- item", { start: 2, end: 2 }, 1)).toEqual({
      source: "  - item",
      selection: { start: 4, end: 4 },
    });
    expect(applyStickyMarkdownIndent("  - item", { start: 4, end: 4 }, -1)).toEqual({
      source: "- item",
      selection: { start: 2, end: 2 },
    });
    expect(applyStickyMarkdownIndent("- item", { start: 2, end: 2 }, -1)).toEqual({
      source: "- item",
      selection: { start: 2, end: 2 },
    });
    expect(applyStickyMarkdownIndent("ab", { start: 1, end: 1 }, 1)).toEqual({
      source: "  ab",
      selection: { start: 3, end: 3 },
    });
    expect(applyStickyMarkdownIndent("  ab", { start: 4, end: 4 }, -1)).toEqual({
      source: "ab",
      selection: { start: 2, end: 2 },
    });
    expect(applyStickyMarkdownIndent("ab", { start: 1, end: 1 }, -1)).toEqual({
      source: "ab",
      selection: { start: 1, end: 1 },
    });
    expect(applyStickyMarkdownIndent("# Heading", { start: 2, end: 2 }, 1)).toEqual({
      source: "  # Heading",
      selection: { start: 4, end: 4 },
    });
    expect(applyStickyMarkdownIndent("# Heading", { start: 2, end: 2 }, -1)).toEqual({
      source: "# Heading",
      selection: { start: 2, end: 2 },
    });

    const mixed = "- a\nplain\n# h\n  - b\n  text";
    const mixedIndented = "  - a\n  plain\n  # h\n    - b\n    text";
    expect(applyStickyMarkdownIndent(mixed, { start: 2, end: mixed.length }, 1)).toEqual({
      source: mixedIndented,
      selection: { start: 4, end: mixedIndented.length },
    });

    const nested = "  - a\n  plain\n    # h\n    - b\n- c";
    const nestedOutdented = "- a\nplain\n  # h\n  - b\n- c";
    expect(applyStickyMarkdownIndent(nested, { start: 0, end: nested.length }, -1)).toEqual({
      source: nestedOutdented,
      selection: { start: 0, end: nestedOutdented.length },
    });
  });

  it("converts typed markdown prefixes through ordinary insertText reparsing", () => {
    const bullet = applyStickyMarkdownEdit("a\n", { start: 2, end: 2 }, {
      type: "insertText",
      text: "- ",
    });
    const bulletLine = parseStickyMarkdown(bullet.source).lines[1];
    expect(bulletLine.kind).toBe("bullet");
    expect(bullet.selection).toEqual({ start: bulletLine.contentStart, end: bulletLine.contentStart });

    const heading = applyStickyMarkdownEdit("a\n", { start: 2, end: 2 }, {
      type: "insertText",
      text: "# ",
    });
    const headingLine = parseStickyMarkdown(heading.source).lines[1];
    expect(headingLine.kind).toBe("heading");
    expect(heading.selection).toEqual({ start: headingLine.contentStart, end: headingLine.contentStart });

    const indentedBullet = applyStickyMarkdownEdit("  ", { start: 2, end: 2 }, {
      type: "insertText",
      text: "- ",
    });
    const indentedBulletLine = parseStickyMarkdown(indentedBullet.source).lines[0];
    expect(indentedBulletLine.kind).toBe("bullet");
    expect(indentedBulletLine.depth).toBe(1);
    expect(indentedBullet.selection).toEqual({
      start: indentedBulletLine.contentStart,
      end: indentedBulletLine.contentStart,
    });

    const indentedHeading = applyStickyMarkdownEdit("  ", { start: 2, end: 2 }, {
      type: "insertText",
      text: "# ",
    });
    const indentedHeadingLine = parseStickyMarkdown(indentedHeading.source).lines[0];
    expect(indentedHeadingLine.kind).toBe("heading");
    expect(indentedHeadingLine.depth).toBe(1);
    expect(indentedHeading.selection).toEqual({
      start: indentedHeadingLine.contentStart,
      end: indentedHeadingLine.contentStart,
    });
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
