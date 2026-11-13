import { describe, expect, test } from "bun:test";
import { CANVAS_COLORS, CANVAS_ICON_GLYPHS, type CanvasIconGlyph } from "../../state/schema";
import { CANVAS_THEME_IDS, canvasThemePreset } from "../../theme/canvas-style";
import { getCanvasAuthoringGuidance } from "../../authoring";
import { BAND_LANE_RUN, BAND_NEED_MAX, bandNeed, EMPTY_BLOCK, LABEL_LEG, LONG_WIRE, SECTION_FILL_MIN, SECTION_GAP_PER_WIRE, SECTION_GAP_SLACK } from "../../authoring/rules";
import { FINISHING_RULES } from "../../board/lints";
import { runDiagnostics } from "../../board/lints/run";
import { NAME_MAX_CHARS, NAME_MAX_WORDS, NAME_TARGET_WORDS } from "../../board/text-rules";
import { LANE_GAP_PX } from "../../connectors/lanes";
import { routeConnectionOnBoard } from "../../connectors/routing";
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
    expect(rules).toContain("Never put a node or a sticky on a section of its own color. Draw a gray node only when the color key gives gray a meaning.");
    expect(rules).toContain("Never nest a gray section directly in a gray section.");
    expect(rules).toContain("Every section and subsection takes a hue that the color key gives a meaning.");
    expect(rules).toContain("Draw a gray or white section only when the source asks for one.");
    expect(rules).toContain("When a check names gray for a section, give it a free hue.");
    expect(topicText("color_palette")).toContain("Draw a gray or white section only when the source asks for one.");
    expect(rules).not.toContain("Gray is for a section with no role hue");
    const palette = topicText("color_palette");
    expect(palette).toContain("A section never takes the color of a node or a sticky it holds, even when all its nodes share one hue");
    for (const topic of getCanvasAuthoringGuidance().topics) {
      expect(topic.text, topic.id).not.toMatch(/category section|gray first|may share its region's hue|Use gray only for|violet or gray section/i);
    }
  });

  test("a named product takes its brand icon from find_icon, and a step takes a specific shape", () => {
    expect(topicText("rules")).toContain("uses its brand icon. Find it with `find_icon` and a `query`");
    expect(topicText("rules")).toContain("A plain `rectangle` is only a payload or a message. Among icon nodes, a step is an icon node too, with the glyph for its role.");
    expect(topicText("rules")).toContain("Each kind of thing the source names takes its own shape or icon. Never repeat one icon across nodes of different kinds.");
    expect(topicText("visual_vocabulary")).toContain("find_icon searches every brand by name");
    expect(topicText("diagram_design")).toContain("use the brand icon find_icon returns");
  });

  test("facts go in a name, a wire label or a sticky beside the node, and a wire label names its cargo", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Put a fact a reader needs (a size, a tool name) in the name, a wire label or a sticky.");
    expect(rules).toContain("Put each sticky beside the node it explains and the color key under the title, never in a band between sections.");
    expect(topicText("color_palette")).toContain("as a short note under the title");
    // Round 5 cycle 3: board 03 moved its notes and its key into the gaps between sections.
    for (const topic of getCanvasAuthoringGuidance().topics) expect(topic.text, topic.id).not.toContain("or the first section");
    expect(rules).toContain("A wire label says what the wire carries. It never repeats a node or section name.");
  });

  test("a full board makes room with arrange flow, and a section keeps the size of its content", () => {
    const rules = topicText("rules");
    expect(rules).toContain('`flow: {axis: "x" or "y", gap}`');
    for (const id of ["rules", "diagram_design"]) expect(topicText(id), id).not.toContain("Leave no empty column or band");
    expect(rules).toContain("A section keeps the size of its content: `fit_section` sets it.");
    // Of the whole section, a 2 by 2 grid `arrange_section` laid out fills 32%: the measure is the room inside the padding.
    expect(rules).toContain(`Its nodes fill ${SECTION_FILL_MIN * 100}% or more of the room inside its padding.`);
    expect(rules).toContain("Never stretch a section or a node to fill a row, align an edge or make room for a wire.");
    expect(rules).toContain("Center a section on the node or section it connects to, and a hub on the row it fans out to.");
    expect(rules).toContain("Where two sections map node to node, set each target in line with its source across the gap, so the wire runs straight.");
  });

  test("the flow sets the board shape, a board past the image size grows its shorter edge first, and no edge has a cap", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Choose the board shape the flow needs, and move whole sections to get it. Of two shapes that fit, take the one with the shorter wires.");
    const design = topicText("diagram_design");
    expect(design).toContain("Up to 2576 × 2576px that image is real size.");
    expect(design).toContain("every label prints smaller: the longer edge sets the scale, so past it grow the shorter edge first.");
    expect(design).toContain("Grow a board only when its wires need the room.");
    expect(design).toContain("A left-to-right pipeline with feedback takes a wide board: its stages in one row, in order, and the sections they feed under them.");
    expect(design).toContain("A fan-out takes a hub with its spokes around it.");
    expect(design).toContain("A row holds one chain of stages: a section off the chain goes in another row.");
    expect(design).toContain("To fit the image, never shrink a node, cut a label, square the board or make a band between sections narrower than its need in topic `rules`.");
    expect(design).toContain("Never add room past what topic `rules` gives a band");
    for (const topic of getCanvasAuthoringGuidance().topics) {
      // Round 5 cycle 2: these lines kept a pipeline board square at 45% fill.
      expect(topic.text, topic.id).not.toMatch(/Never one long row|stack a long row into 2 rows/);
      // Round 5 cycle 3: the edge cap put board h1 in 3 rows round a 1360 by 650 empty block.
      expect(topic.text, topic.id).not.toMatch(/3860|No edge passes|To stay under/);
    }
  });

  test("an empty block is measured by area, and its fix shrinks or moves in, never fills", () => {
    expect(EMPTY_BLOCK).toEqual({ area: 120_000, side: 200 });
    const rules = topicText("rules");
    expect(rules).toContain("Keep no empty block of 120,000 px² or more with both sides 200 or more, in the frame or in a section.");
    expect(rules).toContain("To close one, shrink the section or the frame, or move a neighbour in.");
    expect(rules).toContain("Never widen a section, reverse a chain, or add or move a sticky or the key to fill space.");
    expect(rules).toContain("Bend a wire before you keep an empty block.");
    for (const topic of getCanvasAuthoringGuidance().topics) {
      // The round 1 outline line excused the empty blocks the round 5 judges faulted.
      expect(topic.text, topic.id).not.toMatch(/not a rectangle|An empty corner is fine|Every move after the board is wired is rework|move sections closer/);
      // The old limits let a 1270 by 340 block and a 1304 by 276 block pass.
      expect(topic.text, topic.id).not.toMatch(/400 by 400|400 × 400|400 by 300/);
    }
  });

  test("section order comes before routing, and a decline names the move tried", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Section order comes before routing.");
    expect(rules).toContain(`A wire over ${LONG_WIRE} long, a wire through a section that holds neither of its ends and a crossing between sections are placement faults: \`canvas_check\` lists them under LAYOUT.`);
    expect(rules).toContain("Move a section first (swap two neighbours, or change its row), then route.");
    expect(rules).toContain("To decline such a finding, name the move you tried and what it measured.");
    expect(LONG_WIRE).toBe(1500);
  });

  test("a store sits by its writers and after the last stage that feeds it, and a chain never turns back", () => {
    const rules = topicText("rules");
    expect(rules).toContain("A store sits beside the nodes that write to it.");
    expect(rules).toContain("A store or an outcome that several stages feed sits after the last of them, never before or above the first.");
    // A return or a retry runs against the main path, so the rule holds on the main path only.
    expect(rules).toContain("On the main path, a section sits after its source.");
    expect(rules).toContain("Steps inside a section run the same way, and a chain never turns back: one that wraps starts its next row at the same side.");
    // Round 5 cycle 2: this line put a store before the stages that feed it.
    expect(rules).not.toContain("sits beside the section that uses it");
  });

  test("a wire starts on a node, and ends on a frame only for a subsection of 2 or more nodes that all receive it", () => {
    const rules = topicText("rules");
    expect(rules).toContain("A wire always starts on a node.");
    expect(rules).toContain("It ends on a frame only when the frame is a subsection of 2 or more nodes, drawn round exactly the group that receives it: `connect` that frame once.");
    expect(rules).toContain("Any other wire ends on a node: a section with one node wires to the node.");
    const design = topicText("diagram_design");
    expect(design).toContain("Start each wire at the node that sends and end it at the node that acts.");
    expect(design).toContain("When every node of a subsection receives the same wire, end it on the subsection's frame once. When only some act, connect one wire per node.");
    // Round 5 cycle 2: this line turned 20 wires into 30.
    expect(design).not.toContain("not one to the frame");
    // Round 5 cycle 3: these lines drew 8 wires that start on a frame on board h4.
    for (const topic of getCanvasAuthoringGuidance().topics) expect(topic.text, topic.id).not.toMatch(/sends or receives the same wire/);
  });

  test("a record is one stacked subsection whose fields keep their icons, and past 8 sections a parent groups them", () => {
    const rules = topicText("rules");
    expect(rules).toContain("A record of 2 or more fields is one subsection titled for the record, its fields stacked in one column.");
    expect(rules).toContain("Each field keeps its icon or its typed shape: a row of plain rectangles is not a record.");
    expect(rules).toContain("Past 8 top-level sections, group related sections under a parent section.");
  });

  test("stacked sections share a left edge and a width, rows of nodes sit level, and a hub keeps a band for one bus", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Sections stacked in a column share one left edge and one width, from rows of nodes that match, not from a stretch.");
    expect(rules).toContain("Sections side by side keep their rows of nodes level.");
    expect(rules).toContain(`A hub over a row of children keeps one band of ${bandNeed(1)} under it, where the wires to the children run as one bus.`);
    expect(rules).toContain("3 or more wires into one node enter one side as one bus, the side that faces their sources: never turn a wire back to reach another side.");
  });

  test("the board reads one way from the top or the left, and a row of targets follows its sources", () => {
    const rules = topicText("rules");
    expect(rules).toContain("The board reads one way, left to right or top to bottom, and the story starts at the top or the left.");
    expect(rules).toContain("Order a row of targets in the order of their sources.");
    expect(topicText("diagram_design")).toContain("so the main path runs one way: left to right or top to bottom, from the top or the left");
  });

  test("the plan is a wire table by pair of sections and by band, written before the first place_section", () => {
    const workflow = topicText("workflow");
    const understand = workflow.slice(workflow.indexOf("1. Understand."), workflow.indexOf("2. Build."));
    expect(understand).toContain("Before the first `place_section`, write a wire table: one row for each pair of sections with its wires, then one row for each band between neighbour sections, with the wires that run along it and the width that count needs.");
    expect(understand).toContain("choose one reading direction and the board shape the flow needs, and order each row of targets as their sources");
    expect(workflow).toContain("Size each band between sections from the wires that run along it: topic `rules` has the numbers.");
    const design = topicText("diagram_design");
    expect(design).toContain("the color key, and the wire table: every wire by pair of sections, then the lanes in each band between neighbour sections.");
    expect(design).toContain("A band needs 200, and more only for a long label or wires that run along it: topic `rules` has the numbers.");
  });

  test("a fix never stretches a section, merges nodes, deletes a subsection or grows an empty block", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Fix a finding without stretching a section, merging nodes, deleting a subsection or growing an empty block.");
    expect(rules).toContain("Keep a subsection the source names, then shrink the section round it.");
  });

  test("sections that wire to each other sit side by side, in the plan and in the rules", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Put the two sections with the most wires between them side by side.");
    expect(rules).toContain("Never put a section between two sections that wire to each other.");
    expect(topicText("workflow")).toContain("Put the pairs with the most wires next to each other");
  });

  test("a band is sized for the wires that run along it and its longest label, and a band at its need is never empty space", () => {
    const rules = topicText("rules");
    expect(rules).toContain("A band is the gap between two neighbour sections, over the span the two share.");
    expect(rules).toContain(`Its lanes are the wires that run along it for ${BAND_LANE_RUN} or more inside that span: a wire that only crosses it straight is no lane.`);
    expect(rules).toContain(`A band needs ${bandNeed(1)}, or the longest label leg of a chip that sits in it when that is more, plus ${SECTION_GAP_PER_WIRE} for each lane after the first.`);
    expect(rules).toContain(`From its need to ${SECTION_GAP_SLACK} over, a band is right, and is never empty space.`);
    expect(rules).toContain(`A band that needs over ${BAND_NEED_MAX} is a section-order fault: reorder the sections, never widen it.`);
    expect(rules).toContain("One `arrange` call gives a row of sections one gap: where its bands need different widths, set each with `move`.");
    expect([BAND_LANE_RUN, SECTION_GAP_SLACK, BAND_NEED_MAX]).toEqual([40, 120, 400]);
    // A band with no lane, or with one, takes the base gutter.
    expect(bandNeed(0)).toBe(200);
    expect(bandNeed(1)).toBe(200);
    // Round 5 cycle 3: 11 wires that only cross the band of board 09 set it at 820. Its 4 lanes need 260.
    expect(bandNeed(4)).toBe(260);
    // A label leg counts once, as the longest, and only when it passes the gutter.
    expect(bandNeed(1, LABEL_LEG.base + LABEL_LEG.perCharacter * 8)).toBe(200);
    expect(bandNeed(3, LABEL_LEG.base + LABEL_LEG.perCharacter * 16)).toBe(300);
    // 11 lanes are the most a band holds: one more is a section-order fault.
    expect(bandNeed(11)).toBe(BAND_NEED_MAX);
    expect(bandNeed(12)).toBeGreaterThan(BAND_NEED_MAX);
    // Round 5 cycle 3: these lines counted the wires that cross a band, and one gap for a whole row.
    expect(rules).not.toMatch(/crosses it or runs along it|from every pair of sections|more for each of them|the widest gap a band in it needs/);
    expect(rules).toContain(`A horizontal wire leg that carries a label is at least ${LABEL_LEG.base} plus ${LABEL_LEG.perCharacter} for each label character long`);
    expect(rules).toContain(`A vertical one is at least ${LABEL_LEG.vertical} long.`);
    expect(rules).toContain("Gaps inside a section stay as `arrange_section` sets them.");
    // One more wire takes one router lane.
    expect(SECTION_GAP_PER_WIRE).toBeGreaterThanOrEqual(LANE_GAP_PX);
    expect(SECTION_GAP_PER_WIRE - LANE_GAP_PX).toBeLessThan(20);
    // A wire as long as the rule says draws no short-wire finding, and the rule is not far over the need.
    const shortWire = (gap: number, label: string, axis: "x" | "y" = "x") => runDiagnostics(
      makeDocument(
        [box("a", 200, 600), axis === "x" ? box("b", 360 + gap, 600) : box("b", 200, 680 + gap)],
        [{ ...connect("leg", "a", "b"), label }],
      ),
      FINISHING_RULES,
      { canvasStyle: canvasThemePreset("schematic-light") },
    ).filter((finding) => finding.rule === "short-wire");
    for (const characters of [1, 2, 3, 8, 16, 26, 40, 60]) {
      const label = "retry on timeout, then dead letter".repeat(2).slice(0, characters);
      const leg = LABEL_LEG.base + LABEL_LEG.perCharacter * characters;
      expect(shortWire(leg, label), `${characters} characters at ${leg}px`).toEqual([]);
      expect(shortWire(leg * 0.7, label), `${characters} characters at 0.7 of ${leg}px`).toHaveLength(1);
      // The chip lies across a vertical leg, so its length does not grow with the label.
      expect(shortWire(LABEL_LEG.vertical, label, "y"), `${characters} characters on a vertical leg`).toEqual([]);
      expect(shortWire(LABEL_LEG.vertical * 0.7, label, "y"), `${characters} characters on a short vertical leg`).toHaveLength(1);
    }
  });

  test("a thing's parts and a named group of 2 or more nodes are a subsection, built from the inside out", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Draw what lives inside a thing as a subsection: `place_section` inside the section, titled for the thing.");
    expect(rules).toContain("the parts go in the subsection, and no wire runs from the thing to each part");
    expect(rules).toContain("2 or more nodes that share a group name make a subsection too.");
    expect(rules).toContain("A section of 8 or more nodes holds subsections: name its groups before you place a node.");
    expect(rules).toContain("When the source names two sides (inside and outside, existing and proposed), each side of 2 or more nodes is a subsection.");
    expect(rules).toContain("Never draw a subsection for 1 node or for a group with no name.");
    expect(rules).toContain("A subsection takes a color apart from its section and from the subsections beside it.");
    expect(rules).toContain("Never call `arrange_section` on a section that holds subsections. `arrange` its subsections and loose nodes with `space`, then call `fit_section` on it.");
    const design = topicText("diagram_design");
    expect(design).toContain("a named group inside it is a subsection with its own title");
    expect(design).toContain("call arrange_section on each subsection, arrange the subsections with space, then call fit_section on the section");
    expect(design).toContain("or a part inside the subsection of the thing that holds it");
    expect(topicText("workflow")).toContain("Make each thing that holds parts and each named group inside a section a subsection");
  });

  test("wires of one meaning run as one trunk, and wires that differ in color or dash take their own side", () => {
    const rules = topicText("rules");
    expect(rules).toContain("Wires that share a source or a target and one meaning run as one trunk and split at the end.");
    expect(rules).toContain("Give them one color and one dash, and never split a trunk the board merged.");
    expect(rules).toContain("Wires that differ in color or dash never share a line or an arrowhead.");
    expect(rules).toContain("Where two meanings meet one node, give each its own side of the node, nearest its other ends: set `anchor` on that end in `connect`, or with `change_connection`");
    expect(rules).toContain("Two wires that cross on the way in trade sides, so choose sides that keep them apart.");
    expect(rules).toContain("Never pin a wire end with `position` to place or spread arrowheads. The board centers and merges them. `anchor` only picks the side.");
    // Round 5 cycle 1: this line put two meanings on one line into a node.
    expect(rules).not.toContain("keep that junction");
    // The build step names the call at the point the drawer connects.
    expect(topicText("workflow")).toContain("Where wires of two meanings end at one node, set `anchor` in `connect`: each meaning gets its own side.");
  });

  test("`anchor` gives each meaning its own side of a node, and each side still merges its wires", () => {
    const objects = [
      box("a1", 0, 0, 280, 100), box("a2", 0, 240, 280, 100),
      box("b1", 0, 800, 280, 100), box("b2", 0, 1040, 280, 100),
      box("x", 1000, 300, 280, 100),
    ];
    const byId = new Map(objects.map((object) => [object.id, object]));
    const target = byId.get("x")!.geometry;
    const side = ({ x, y }: { x: number; y: number }) => x <= target.x ? "left" : y >= target.y + target.height ? "bottom" : y <= target.y ? "top" : "right";
    /** Where each wire's arrowhead lands, with the dashed pair anchored or not. */
    const heads = (anchor?: "bottom") => {
      const to = { objectId: "x", ...(anchor ? { anchor } : {}) };
      const connections = [
        { ...connect("w1", "a1", "x"), color: "blue" as const },
        { ...connect("w2", "a2", "x"), color: "blue" as const },
        { ...connect("w3", "b1", "x"), to, color: "orange" as const, style: "dashed" as const },
        { ...connect("w4", "b2", "x"), to, color: "orange" as const, style: "dashed" as const },
      ];
      const board = { objects, connections };
      return connections.map((connection) => {
        const end = routeConnectionOnBoard(board, connection, byId.get(connection.from.objectId)!, byId.get("x")!, canvasThemePreset("schematic-light")).points.at(-1)!;
        return { side: side(end), end: `${end.x},${end.y}` };
      });
    };
    // With no anchor, the two meanings land on one side of the node.
    expect(new Set(heads().map((head) => head.side)).size).toBe(1);
    const [solid1, solid2, dashed1, dashed2] = heads("bottom");
    expect([solid1!.side, solid2!.side, dashed1!.side, dashed2!.side]).toEqual(["left", "left", "bottom", "bottom"]);
    expect(solid1!.end).toBe(solid2!.end);
    expect(dashed1!.end).toBe(dashed2!.end);
  });

  test("the workflow rethinks the board once after the first draft, with three written answers", () => {
    const workflow = topicText("workflow");
    const rethink = workflow.slice(workflow.indexOf("3. Rethink, once"), workflow.indexOf("4. Finish."));
    for (const part of [
      "Call `canvas_check`, and read its whole-board PNG and its LAYOUT block.",
      "`look` at `page-frame`: MEASURES prints the gaps between its sections",
      `Which section move (swap two neighbours, change a row) removes each wire over ${LONG_WIRE}, each wire through a section that holds neither end and each crossing between sections?`,
      `Which band is under its need in topic \`rules\`, over ${SECTION_GAP_SLACK} more, or needs over ${BAND_NEED_MAX}?`,
      "Does another board shape (wider, taller, a grid, a hub with spokes) fit the flow better and close an empty block?",
      "Never narrow a band below its need.",
      "whole sections with `arrange` or `move`",
      "then each row's gap again (`arrange` with `space` along a row, `move` with `by` for the rows below), then `tighten_wires`",
      "Moving sections after the first draft is normal.",
    ]) expect(rethink, part).toContain(part);
    // The runner sends this step as its own turn with the numbers, so the step stays short.
    expect(Buffer.byteLength(rethink)).toBeLessThan(900);
    const design = topicText("diagram_design");
    expect(design).toContain("6. Rethink once, as the workflow says");
    expect(design).toContain("page-frame is working room: resize it to hold the plan first");
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
