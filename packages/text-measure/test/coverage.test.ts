import { beforeAll, describe, expect, test } from "bun:test";
import { FACE_TABLES } from "../src/generated/tables.ts";
import { useHarfBuzz } from "../src/headless.ts";
import { measureWidth, uncoveredChars, useTableBackend } from "../src/index.ts";

beforeAll(async () => {
  await useHarfBuzz();
});

describe("uncoveredChars", () => {
  test("Latin, Greek, Cyrillic, punctuation and arrows are covered by Inter", () => {
    expect(uncoveredChars("Ünïcödé àccénts naïve café résumé")).toEqual([]);
    expect(uncoveredChars("Ελληνικά κείμενο για μέτρηση")).toEqual([]);
    expect(uncoveredChars("Кириллица текст для измерения")).toEqual([]);
    expect(uncoveredChars("“Smart quotes” — dashes… → ⇒ ↔")).toEqual([]);
  });

  test("CJK, Hangul, Arabic, Hebrew and Thai are uncovered, one entry per character", () => {
    expect(uncoveredChars("春天到了")).toEqual(["春", "天", "到", "了"]);
    expect(uncoveredChars("한국어")).toEqual(["한", "국", "어"]);
    expect(uncoveredChars("Arabic مرحبا")).toEqual(["م", "ر", "ح", "ب", "ا"]);
    expect(uncoveredChars("שלום")).toEqual(["ש", "ל", "ו", "ם"]);
    expect(uncoveredChars("ภาษาไทย").length).toBeGreaterThan(0);
  });

  test("lists each distinct grapheme once, in order of appearance", () => {
    expect(uncoveredChars("春 春 天 春")).toEqual(["春", "天"]);
  });

  test("emoji are uncovered as whole graphemes: ZWJ sequences, flags, keycaps, VS16", () => {
    expect(uncoveredChars("Ship it 🚀")).toEqual(["🚀"]);
    expect(uncoveredChars("Family 👨‍👩‍👧‍👦 ZWJ")).toEqual(["👨‍👩‍👧‍👦"]);
    expect(uncoveredChars("Flags 🇺🇸 🇯🇵")).toEqual(["🇺🇸", "🇯🇵"]);
    expect(uncoveredChars("Keycaps 1️⃣")).toEqual(["1️⃣"]);
    // Inter maps U+2194, but an explicit emoji presentation selector paints the emoji font.
    expect(uncoveredChars("↔")).toEqual([]);
    expect(uncoveredChars("↔️")).toEqual(["↔️"]);
  });

  test("combining marks: covered with their base when the face maps them", () => {
    expect(uncoveredChars("é ä")).toEqual([]);
    // U+1AB0 (combining doubled circumflex) is not in Inter: the whole cluster falls back.
    expect(uncoveredChars("a᪰ b")).toEqual(["a᪰"]);
  });

  test("controls and invisible format characters are never uncovered", () => {
    expect(uncoveredChars("zero​width‍space­hyphen⁠joined\n\ttabbed﻿")).toEqual([]);
  });

  test("family selects the face; unknown families use Inter's coverage", () => {
    expect(uncoveredChars("λ", "IBM Plex Mono")).toEqual(["λ"]);
    expect(uncoveredChars("λ", "Inter")).toEqual([]);
    expect(uncoveredChars("λ", "'IBM Plex Mono', monospace")).toEqual(["λ"]);
    expect(uncoveredChars("λ", "Roboto")).toEqual([]);
  });
});

describe("estimated widths of uncovered graphemes", () => {
  const size = 16;
  const font = { family: "Inter", size };
  const average = (FACE_TABLES["inter-400"].averageAdvance / FACE_TABLES["inter-400"].unitsPerEm) * size;

  for (const backend of ["harfbuzz", "table"] as const) {
    test(`${backend}: 1em for CJK, Chromium's macOS emoji advance for emoji, the face's average letter otherwise`, async () => {
      if (backend === "table") useTableBackend();
      else await useHarfBuzz();
      expect(measureWidth("春", font)).toBe(size);
      // Chromium 153 on macOS (Apple Color Emoji) paints emoji 20px wide at 16px.
      expect(measureWidth("👨‍👩‍👧‍👦", font)).toBe(20);
      expect(measureWidth("🇺🇸", font)).toBe(20);
      expect(measureWidth("🇺🇸", { family: "Inter", size: 24 })).toBe(24);
      expect(Math.abs(measureWidth("م", font) - average)).toBeLessThanOrEqual(1 / 64);
      // Covered text around an uncovered grapheme keeps its own shaping.
      expect(Math.abs(measureWidth("AV春AV", font) - (2 * measureWidth("AV", font) + size))).toBeLessThanOrEqual(2 / 64);
    });
  }
});
