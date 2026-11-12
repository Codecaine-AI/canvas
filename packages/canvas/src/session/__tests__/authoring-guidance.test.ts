import { describe, expect, test } from "bun:test";
import { CANVAS_COLORS, CANVAS_ICON_GLYPHS, type CanvasIconGlyph } from "../../state/schema";
import { CANVAS_THEME_IDS, canvasThemePreset } from "../../theme/canvas-style";
import { getCanvasAuthoringGuidance } from "../../authoring";
import { LABEL_LEG, SECTION_GAP_PER_WIRE } from "../../authoring/rules";
import { FINISHING_RULES } from "../../board/lints";
import { runDiagnostics } from "../../board/lints/run";
import { NAME_MAX_CHARS, NAME_MAX_WORDS, NAME_TARGET_WORDS } from "../../board/text-rules";
import { LANE_GAP_PX } from "../../connectors/lanes";
import { OBJECT_PREFERENCES } from "../../objects/registry";
import { ICON_GLYPH_CATEGORIES, resolveIconGlyph } from "../../objects/shapes/icon/icon-glyphs";
import { box, connect, makeDocument } from "./synthetic";

function topicText(id: string): string {
  const topic = getCanvasAuthoringGuidance().topics.find(entry => entry.id === id);
  expect(topic, id).toBeDefined();
  return topic!.text;
}

/** An entry bullet opens with the name and its preferred color, then its meaning on the same line. */
const ENTRY = new RegExp(`^\\s*- (\\S+) \\((?:${CANVAS_COLORS.join("|")})\\): `, "gm");

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
      expect(catalog).toContain(`- ${entry.name} (${entry.color}): `);
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

  test("the name convention quotes the limits in board/text-rules.ts, and no topic teaches a node detail", () => {
    const design = topicText("diagram_design");
    expect(design).toContain(`${NAME_TARGET_WORDS} words`);
    expect(design).toContain("A node shows its name only; put extra context in a sticky note next to it.");
    for (const topic of getCanvasAuthoringGuidance().topics) {
      expect(topic.text, topic.id).not.toMatch(/`detail`|detail line|detail=/);
    }

    const conventions = topicText("canvas_conventions");
    for (const fragment of [
      `${NAME_MAX_WORDS} words`,
      `${NAME_MAX_CHARS} characters`,
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

  test("the color rules ban a node on its own section color and gray in gray, with no category exemption or gray-first order", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Never put a node or a sticky on a section of its own color.");
    expect(rules).toContain("Never nest a gray section directly in a gray section.");
    expect(rules).toContain("Every section takes a hue that the color key gives a meaning.");
    expect(rules).toContain("Draw a gray section only when the source asks for one.");
    expect(rules).not.toContain("Gray is for a section with no role hue");
    const palette = topicText("color_palette");
    expect(palette).toContain("A section never takes the color of a node or a sticky it holds, even when all its nodes share one hue");
    for (const topic of getCanvasAuthoringGuidance().topics) {
      expect(topic.text, topic.id).not.toMatch(/category section|gray first|may share its region's hue/i);
    }
  });

  test("a named product takes its brand icon from find_icon, and a step takes a specific shape", () => {
    expect(topicText("rules")).toContain("uses its brand icon. Find it with `find_icon` and a `query`");
    expect(topicText("rules")).toContain("A plain `rectangle` is only a payload or a message.");
    expect(topicText("rules")).toContain("Each kind of thing the source names takes its own shape or icon. Never repeat one icon across nodes of different kinds.");
    expect(topicText("visual_vocabulary")).toContain("find_icon searches every brand by name");
    expect(topicText("diagram_design")).toContain("use the brand icon find_icon returns");
  });

  test("facts go in a name, a wire label or a sticky beside the node, and a wire label names its cargo", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Put a fact a reader needs (a size, a tool name) in the name, a wire label or a sticky.");
    expect(rules).toContain("Put each sticky beside the node it explains.");
    expect(rules).toContain("A wire label says what the wire carries. It never repeats a node or section name.");
  });

  test("a full board makes room with arrange flow, and its outline follows the flow, not a rectangle", () => {
    for (const id of ["rules", "diagram_design"]) {
      const text = topicText(id);
      expect(text, id).toContain('`flow: {axis: "x" or "y", gap}`');
      expect(text, id).toContain("outline follows the flow, not a rectangle");
      expect(text, id).toContain("Center a section on the node or section it connects to");
      expect(text, id).not.toContain("Leave no empty column or band");
    }
    expect(topicText("rules")).toContain("Never stretch a section or a node to fill a row.");
  });

  test("the outline rule asks for the shape with the shortest wires, and no rule excuses a far section", () => {
    expect(topicText("rules")).toContain("Choose the shape that makes the wires shortest (wider, taller, a grid, a hub with spokes), and move whole sections to get it.");
    expect(topicText("diagram_design")).toContain("a hub with its spokes around it");
    for (const topic of getCanvasAuthoringGuidance().topics) {
      expect(topic.text, topic.id).not.toMatch(/An empty corner is fine|Every move after the board is wired is rework|move sections closer/);
    }
  });

  test("sections that wire to each other sit side by side, in the plan and in the rules", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Put the two sections with the most wires between them side by side.");
    expect(rules).toContain("A store, a sink or a check sits beside the section that uses it.");
    expect(rules).toContain("Never put a section between two sections that wire to each other.");
    expect(topicText("workflow")).toContain("count the wires between each pair of sections, put the pairs with the most wires next to each other");
  });

  test("the gap between sections and the length of a labeled leg come from the router and the chip", () => {
    const rules = topicText("rules");
    expect(rules).toContain(`plus ${SECTION_GAP_PER_WIRE} for each wire after the first`);
    expect(rules).toContain(`at least ${LABEL_LEG.base} plus ${LABEL_LEG.perCharacter} for each label character long`);
    expect(rules).toContain("Gaps inside a section stay as `arrange_section` sets them.");
    // One more wire takes one router lane.
    expect(SECTION_GAP_PER_WIRE).toBeGreaterThanOrEqual(LANE_GAP_PX);
    expect(SECTION_GAP_PER_WIRE - LANE_GAP_PX).toBeLessThan(20);
    // A wire as long as the rule says draws no short-wire finding, and the rule is not far over the need.
    const shortWire = (gap: number, label: string) => runDiagnostics(
      makeDocument([box("a", 200, 600), box("b", 360 + gap, 600)], [{ ...connect("leg", "a", "b"), label }]),
      FINISHING_RULES,
      { canvasStyle: canvasThemePreset("schematic-light") },
    ).filter((finding) => finding.rule === "short-wire");
    for (const characters of [1, 2, 3, 8, 16, 26, 40, 60]) {
      const label = "retry on timeout, then dead letter".repeat(2).slice(0, characters);
      const leg = LABEL_LEG.base + LABEL_LEG.perCharacter * characters;
      expect(shortWire(leg, label), `${characters} characters at ${leg}px`).toEqual([]);
      expect(shortWire(leg * 0.7, label), `${characters} characters at 0.7 of ${leg}px`).toHaveLength(1);
    }
  });

  test("a named group of 2 or more nodes is a subsection, built from the inside out", () => {
    const rules = topicText("rules");
    expect(rules).toContain("When the source says a thing holds parts, or 2 or more nodes in a section share a group name, draw the group as a subsection");
    expect(rules).toContain("Never draw a subsection for 1 node or for a group with no name.");
    expect(rules).toContain("A subsection takes a color apart from its section and from the subsections beside it.");
    expect(rules).toContain("Never call `arrange_section` on a section that holds subsections. `arrange` its subsections with `space`, then call `fit_section` on it.");
    const design = topicText("diagram_design");
    expect(design).toContain("a named group inside it is a subsection with its own title");
    expect(design).toContain("call arrange_section on each subsection, arrange the subsections with space, then call fit_section on the section");
    expect(topicText("workflow")).toContain("make each named group inside a section a subsection");
  });

  test("wires of one meaning run as one trunk, and the board's merge stays", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Wires that share a source or a target and one meaning run as one trunk and split at the end.");
    expect(rules).toContain("never split a trunk the board merged");
    expect(rules).toContain("Wires with different meanings take different colors and stay apart.");
  });

  test("the workflow rethinks the board once after the first draft, with three written answers", () => {
    const workflow = topicText("workflow");
    const rethink = workflow.slice(workflow.indexOf("3. Rethink, once"), workflow.indexOf("4. Finish."));
    for (const part of [
      "Call `canvas_check`, and read its whole-board PNG and its LAYOUT block.",
      "Which 3 wires are longest, and which section move shortens them?",
      "Which gap between sections is most crowded?",
      "Does another board shape (wider, taller, a grid, a hub with spokes) shorten the wires?",
      "move whole sections with `arrange` or `move`",
      "call `tighten_wires` again",
      "Moving sections after the first draft is normal.",
    ]) expect(rethink, part).toContain(part);
    expect(topicText("diagram_design")).toContain("6. Rethink once, as the workflow says");
  });

  test("the state grammar keys only blocks the MCP tools print", () => {
    const grammar = topicText("state_grammar");
    for (const tag of ["<recent_ops>", "<diff>", "<views>", "<recent_conversation>", "<state>", "finalize"]) {
      expect(grammar, tag).not.toContain(tag);
    }
  });

  // The served guidance at canvas main 6e7cedf was 71,076 bytes. Growth had no
  // score effect in the stage B meta-analysis, so a new rule must replace text.
  test("the served guidance stays within its size at 6e7cedf", () => {
    const bytes = getCanvasAuthoringGuidance().topics
      .reduce((sum, topic) => sum + Buffer.byteLength(`# ${topic.title}\n\n${topic.text}`), 0);
    expect(bytes).toBeLessThanOrEqual(71_076);
  });
});
