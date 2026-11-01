import { writeFileSync } from "node:fs";

import { describe, expect, test } from "bun:test";

import { vocabularyContactSheet } from "..";
import { DEFAULT_CANVAS_STYLE } from "../../theme/canvas-style";

import { buildVocabularyDocument } from "../perception/contact-sheet";
import { textFitReport } from "../../board/text-fit";

const PNG_SIGNATURE = "89504e470d0a1a0a";

describe("session vocabulary contact sheet", () => {
  test("renders the live object vocabulary as a PNG", () => {
    const sheet = vocabularyContactSheet();

    expect(Buffer.isBuffer(sheet)).toBe(true);
    if (!sheet) return;
    expect(sheet.subarray(0, 8).toString("hex")).toBe(PNG_SIGNATURE);
    writeFileSync("/tmp/contact-sheet.png", sheet);
  });

  test("derives a no-argument sheet once and caches it for the static process roster", () => {
    expect(vocabularyContactSheet.length).toBe(0);

    const first = vocabularyContactSheet();
    const second = vocabularyContactSheet();

    expect(first).toBe(second);
  });
  test.each([DEFAULT_CANVAS_STYLE.textFontSizePx, 28])("every caption fits whole at a %spx name size", (size) => {
    const style = { ...DEFAULT_CANVAS_STYLE, textFontSizePx: size };
    const captions = buildVocabularyDocument(style).objects.filter((object) => /^(label|family)-/.test(object.id));
    expect(captions.length).toBeGreaterThan(5);
    const clipped = captions.filter(
      (caption) => textFitReport(caption, caption.geometry, caption.text ?? "", style).verdict !== "fits",
    );
    expect(clipped.map((caption) => caption.id)).toEqual([]);
  });
});
