import { describe, expect, test } from "bun:test";
import { CANVAS_COLORS, CANVAS_ICON_GLYPHS, type CanvasIconGlyph } from "@codecaine-ai/canvas/schema";
import { CANVAS_THEME_IDS } from "@codecaine-ai/canvas/style";
import { getCanvasAuthoringGuidance } from "../src/authoring";
import { DETAIL_MAX_CHARS, NAME_MAX_CHARS, NAME_MAX_WORDS, NAME_TARGET_WORDS } from "../src/board/text-rules";
import { OBJECT_PREFERENCES } from "../../canvas/src/objects/registry";
import { ICON_GLYPH_CATEGORIES, resolveIconGlyph } from "../../canvas/src/objects/shapes/icon/icon-glyphs";

function topicText(id: string): string {
  const topic = getCanvasAuthoringGuidance().topics.find(entry => entry.id === id);
  expect(topic, id).toBeDefined();
  return topic!.text;
}

/** An entry bullet is the name and its preferred color, nothing else on the line. */
const ENTRY = new RegExp(`^\\s*- (\\S+) \\((?:${CANVAS_COLORS.join("|")})\\)$`, "gm");

/** The catalog's groups in order: the group name, any lead text, and the entry names under it. */
function catalogGroups(vocabulary: string) {
  const catalog = vocabulary.slice(vocabulary.indexOf("<object_catalog>"), vocabulary.indexOf("</object_catalog>"));
  return [...catalog.matchAll(/<group name="([^"]*)">([\s\S]*?)<\/group>/g)].map(([, name, body]) => {
    const bullets = [...body!.matchAll(ENTRY)];
    return {
      name: name!.replaceAll("&amp;", "&"),
      lead: body!.slice(0, bullets[0]?.index ?? body!.length).trim(),
      entries: bullets.map(match => match[1]!),
    };
  });
}

const GLYPHS: ReadonlySet<string> = new Set(CANVAS_ICON_GLYPHS);

/** 0 = shape type, 1 = generic glyph, 2 = brand logo: the order the catalog groups them in. */
const kindRank = (name: string) => !GLYPHS.has(name) ? 0 : name.startsWith("brand-") ? 2 : 1;

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

  test("the catalog lists every entry and every glyph once: shapes, glyphs by registry category, brand logos last", () => {
    const groups = catalogGroups(topicText("visual_vocabulary"));
    const listed = groups.flatMap(group => group.entries);
    expect([...listed].sort()).toEqual(OBJECT_PREFERENCES.map(entry => entry.name).sort());
    expect(listed.filter(name => GLYPHS.has(name)).sort()).toEqual([...CANVAS_ICON_GLYPHS].sort());

    // One kind per group, the kinds in order, and each glyph under its own category.
    const ranks = groups.map(group => {
      const kinds = new Set(group.entries.map(kindRank));
      expect(kinds.size, group.name).toBe(1);
      return [...kinds][0]!;
    });
    expect(ranks).toEqual([...ranks].sort());
    const labels = new Map<string, string>(ICON_GLYPH_CATEGORIES.map(({ id, label }) => [id, label]));
    for (const group of groups) {
      for (const glyph of group.entries.filter(name => GLYPHS.has(name))) {
        expect(group.name, glyph).toBe(labels.get(resolveIconGlyph(glyph as CanvasIconGlyph, "nucleo").category)!);
      }
    }

    // The brand-versus-generic rule heads the brand logos.
    expect(groups.find(group => kindRank(group.entries[0]!) === 2)!.lead).not.toBe("");
  });

  test("the name and detail convention quotes the limits the text lints enforce", () => {
    const design = topicText("diagram_design");
    expect(design).toContain(`${NAME_TARGET_WORDS} words`);
    expect(design).toContain(`${DETAIL_MAX_CHARS} characters`);

    const conventions = topicText("canvas_conventions");
    for (const fragment of [
      "label-is-prose",
      "detail-too-long",
      `${NAME_MAX_WORDS} words`,
      `${NAME_MAX_CHARS} characters`,
      `${DETAIL_MAX_CHARS} characters`,
    ]) {
      expect(conventions, fragment).toContain(fragment);
    }
  });

  test("every brand logo the guidance cites is a real glyph, and the design topic cites one for a section icon", () => {
    const { topics } = getCanvasAuthoringGuidance();
    const cited = (text: string) => [...text.matchAll(/\bbrand-[a-z0-9]+(?:-[a-z0-9]+)*/g)].map(match => match[0]);
    for (const topic of topics) {
      for (const glyph of cited(topic.text)) expect(GLYPHS.has(glyph), `${topic.id}: ${glyph}`).toBe(true);
    }
    expect(cited(topicText("diagram_design")).length).toBeGreaterThan(0);
  });

  test("the palette keeps the color roster and names every visual theme", () => {
    const palette = topicText("color_palette");
    expect(palette).toContain(CANVAS_COLORS.join(", "));
    for (const theme of CANVAS_THEME_IDS) expect(palette, theme).toContain(theme);
  });
});
