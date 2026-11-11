/**
 * The rule-unit manifest of the deleted skill against the served topics, the canvas_capabilities index, the edit
 * gate and the contact-sheet resource. Every check runs in process, with no network call.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { VISUAL_PATTERNS, getCanvasAuthoringGuidance } from "@codecaine-ai/canvas/authoring";
import { CANVAS_COLORS } from "@codecaine-ai/canvas/schema";

import { NAME_TARGET_WORDS } from "../../canvas/src/board/text-rules";
import { catalogCounts } from "../../canvas/src/authoring/vocabulary";
import { CRAFT_TARGETS } from "../../canvas/src/authoring/style-guide/craft-targets";
import { AGENT_GRID } from "../../canvas/src/session/tools/grid";
import pkg from "../package.json";
import {
  SCENARIOS,
  UNGATED,
  WORKFLOW_GATE,
  guidanceManifest,
  type ManifestUnit,
} from "./guidance-manifest";
import { createCanvasService, setServedTextHook } from "./service";

const manifest = await guidanceManifest();
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const TOPICS = getCanvasAuthoringGuidance().topics.map((topic) => topic.id);
const REPO_CANVASES = join(import.meta.dir, "..", "..", "..", "canvases");
/** The text of a result's text blocks. */
const textOf = (result: { content: Array<{ type: string; text?: string }> }) =>
  result.content.map((block) => (block.type === "text" ? block.text : "")).join("\n");

describe("coverage", () => {
  test("every unit has a destination topic or a named drop, and no other destination", () => {
    const findings = manifest.flatMap((unit) => {
      const destination = unit.destination as Record<string, unknown>;
      const keys = Object.keys(destination).sort().join(",");
      if (keys === "topic") return TOPICS.includes(destination.topic as string) ? [] : [`${unit.id}: unknown topic ${destination.topic}`];
      if (keys === "drop,reason") return ["instruments", "skill-folder"].includes(destination.drop as string) && String(destination.reason).trim() !== "" ? [] : [`${unit.id}: a drop names instruments or skill-folder and a reason`];
      return [`${unit.id}: destination ${JSON.stringify(destination)} is not a topic or a drop`];
    });
    expect(findings).toEqual([]);
    expect(new Set(manifest.map((unit) => unit.id)).size).toBe(manifest.length);
    expect(manifest.filter((unit) => !(unit.scenario in SCENARIOS)).map((unit) => unit.id)).toEqual([]);
    // Prose is proved by its anchors, and a skill-folder drop by nothing.
    const unanchored = (unit: ManifestUnit) => "drop" in unit.destination && unit.destination.drop === "skill-folder";
    expect(manifest.filter((unit) => unanchored(unit) !== (unit.anchors.length === 0)).map((unit) => unit.id)).toEqual([]);
    // A correction names the code that proves it.
    expect(manifest.filter((unit) => unit.correction && !/:\d+/.test(unit.correction.source)).map((unit) => unit.id)).toEqual([]);
  });
});

/** The value in the code behind each count a unit records. */
const CODE_COUNTS: Readonly<Record<string, number>> = {
  "name words": NAME_TARGET_WORDS,
  grid: AGENT_GRID,
  "node width": CRAFT_TARGETS.nodeWidth,
  "node height": CRAFT_TARGETS.nodeHeight,
  "row gap": CRAFT_TARGETS.nodeGapRow,
  "column gap": CRAFT_TARGETS.nodeGapColumn,
  patterns: VISUAL_PATTERNS.length,
  "object kinds": catalogCounts().kinds,
  "kind groups": catalogCounts().groups,
  colors: CANVAS_COLORS.length,
};

/** The tools in tools/list, the resources in resources/list, and the text an edit gets before the workflow read. */
type Observed = { tools: ReadonlySet<string>; resources: ReadonlySet<string>; refusal: string };

/** Every way the served text fails to keep a unit. */
function contractFindings(unit: ManifestUnit, served: string, observed: Observed): string[] {
  const findings: string[] = [];
  for (const anchor of unit.anchors) if (!served.includes(anchor)) findings.push(`${unit.id}: the served text lacks "${anchor}"`);
  for (const tool of unit.behavior?.tools ?? []) {
    if (!observed.tools.has(tool)) findings.push(`${unit.id}: ${tool} is not in tools/list`);
    if (!served.includes(tool)) findings.push(`${unit.id}: the served text does not name ${tool}`);
  }
  if (unit.behavior?.refusal !== undefined && unit.behavior.refusal !== observed.refusal) findings.push(`${unit.id}: an edit is refused with "${observed.refusal}"`);
  const resource = unit.behavior?.resource;
  if (resource !== undefined && (!observed.resources.has(resource) || !served.includes(resource))) findings.push(`${unit.id}: ${resource} is not listed and served`);
  for (const [name, count] of Object.entries(unit.behavior?.counts ?? {})) {
    if (CODE_COUNTS[name] !== count) findings.push(`${unit.id}: the code holds ${name} ${CODE_COUNTS[name]}, not ${count}`);
    if (!new RegExp(`\\b${count}\\b`).test(served)) findings.push(`${unit.id}: the served text does not state ${name} ${count}`);
  }
  return findings;
}

/** The test hook body: the served text without the unit's lines and anchor phrases. */
const strip = (unit: ManifestUnit) => (text: string) => {
  const body = unit.text.split("\n");
  const lines = new Set(body.map((line) => line.trim()).filter((line) => line !== ""));
  let out = text.split("\n").filter((line) => !lines.has(line.trim())).join("\n");
  for (const anchor of unit.anchors) while (out.includes(anchor)) out = out.replaceAll(anchor, "");
  return out;
};

/** A workspace with the repo's v2-flow board in canvases/. */
function boardWorkspace(): string {
  const workspace = mkdtempSync(join(tmpdir(), "canvas-capabilities-"));
  mkdirSync(join(workspace, "canvases"));
  copyFileSync(join(REPO_CANVASES, "v2-flow.canvas.json"), join(workspace, "canvases", "v2-flow.canvas.json"));
  return workspace;
}

describe("manifest contract", () => {
  let service: ReturnType<typeof createCanvasService>;
  let workspace: string;
  let observed: Observed;
  const servedFor = async (unit: ManifestUnit) =>
    "topic" in unit.destination ? textOf(await service.call("canvas_guidance", { topic: unit.destination.topic })) : undefined;
  beforeAll(async () => {
    workspace = boardWorkspace();
    service = createCanvasService({ workspace });
    await service.call("canvas_open", { canvas: "v2-flow" });
    const refused = await service.call("place_sticky", { id: "gate-note", text: "Refused", at: [960, 1600] });
    observed = {
      tools: new Set(service.listTools().map((tool) => tool.name)),
      resources: new Set(service.listResources().map((resource) => resource.uri)),
      refusal: textOf(refused),
    };
  });
  afterAll(() => { setServedTextHook(); rmSync(workspace, { recursive: true, force: true }); });

  test("each unit's served topic keeps its text or anchors and its recorded behavior", async () => {
    const findings: string[] = [];
    for (const unit of manifest) {
      const served = await servedFor(unit);
      if (served !== undefined) findings.push(...contractFindings(unit, served, observed));
    }
    expect(findings).toEqual([]);
    expect(observed.refusal).toBe(WORKFLOW_GATE);
  });

  test("stripping one unit from the served topic fails that unit's contract, and the manifest stays unchanged", async () => {
    const before = JSON.stringify(manifest);
    const survivors: string[] = [];
    try {
      for (const unit of manifest.filter((unit) => "topic" in unit.destination)) {
        setServedTextHook(strip(unit));
        if (contractFindings(unit, (await servedFor(unit))!, observed).length === 0) survivors.push(unit.id);
      }
    } finally { setServedTextHook(); }
    expect(survivors).toEqual([]);
    expect(JSON.stringify(manifest)).toBe(before);
    expect(JSON.stringify(await guidanceManifest())).toBe(before);
  });
});

const INDEX_FIELDS = [
  "protocol_version", "server_version", "tool_contract_hash", "guidance_snapshot", "scope", "guidance_tool", "entry_tool",
  "completion_tools", "operations", "topics", "discovery_tools", "features", "next_cursor",
];

describe("canvas_capabilities and the edit gate", () => {
  let workspace: string;
  beforeAll(() => { workspace = boardWorkspace(); });
  afterAll(() => rmSync(workspace, { recursive: true, force: true }));

  test("returns the index fields in one page of 4,096 bytes or less, each topic with its size and gate", async () => {
    const service = createCanvasService({ workspace });
    const result = await service.call("canvas_capabilities", {});
    const page = textOf(result);
    expect(Buffer.byteLength(page)).toBeLessThanOrEqual(4096);
    const index = JSON.parse(page) as Record<string, any>;
    expect(Object.keys(index)).toEqual(INDEX_FIELDS);
    const guidance = getCanvasAuthoringGuidance();
    expect(index).toMatchObject({
      protocol_version: "1", server_version: pkg.version, guidance_snapshot: guidance.snapshotId, scope: { workspace },
      guidance_tool: "canvas_guidance", entry_tool: "canvas_open", completion_tools: ["canvas_check"],
      features: ["codecaine://canvas/contact-sheet"], next_cursor: null,
    });
    expect(index.tool_contract_hash).toBe(`sha256:${sha256(JSON.stringify(service.listTools()))}`);
    const names = service.listTools().map((tool) => tool.name);
    expect(index.operations.filter((name: string) => !names.includes(name))).toEqual([]);
    expect(index.discovery_tools).toEqual([{ name: "canvas_list", purpose: "List the 1 board in canvases/, with each id, title and object count." }]);
    expect(index.topics.map((topic: any) => topic.id)).toEqual(TOPICS);
    expect(TOPICS).toEqual(["workflow", "rules", "operating_context", "state_grammar", "aesthetic", "visual_patterns", "diagram_design", "visual_vocabulary", "color_palette", "canvas_conventions"]);
    for (const topic of index.topics) {
      expect(topic.bytes, topic.id).toBe(Buffer.byteLength(textOf(await service.call("canvas_guidance", { topic: topic.id }))));
    }
    // Only the workflow topic gates, and it gates every tool outside the six read tools.
    expect(index.topics.filter((topic: any) => topic.required_for.length > 0).map((topic: any) => topic.id)).toEqual(["workflow"]);
    expect(index.topics[0].required_for).toEqual(names.filter((name) => !UNGATED.has(name)));
    expect([...UNGATED]).toEqual(["canvas_capabilities", "canvas_list", "canvas_open", "canvas_guidance", "look", "canvas_check"]);
  });

  test("required_for lists exactly the tools refused before the workflow read, and each one runs after it", async () => {
    const service = createCanvasService({ workspace });
    const { topics } = JSON.parse(textOf(await service.call("canvas_capabilities", {}))) as { topics: { id: string; required_for: string[] }[] };
    await service.call("canvas_open", { canvas: "v2-flow" });
    const refused: string[] = [];
    for (const { name } of service.listTools()) {
      const result = await service.call(name, {});
      if (textOf(result) === WORKFLOW_GATE) {
        expect(result.isError, name).toBe(true);
        refused.push(name);
      }
    }
    expect(refused).toEqual(topics[0]!.required_for);
    // The six read tools stay open before the read.
    expect((await service.call("look", { view: "page-frame" })).isError).toBeUndefined();
    expect((await service.call("canvas_check", {})).isError).toBeFalsy();

    // Another topic does not open the gate, and the workflow topic does, for every gated tool.
    await service.call("canvas_guidance", { topic: "rules" });
    expect(textOf(await service.call("place_sticky", { id: "gate-note", text: "Gated", at: [960, 1600] }))).toBe(WORKFLOW_GATE);
    expect(textOf(await service.call("canvas_guidance", { topic: "workflow" }))).toStartWith("# Canvas Workflow");
    const placed = await service.call("place_sticky", { id: "gate-note", text: "Gated", at: [960, 1600] });
    expect(textOf(placed)).toContain("APPLIED · place_sticky gate-note");
    for (const name of refused) expect(textOf(await service.call(name, {})), name).not.toBe(WORKFLOW_GATE);

    // The read belongs to this server process: a new service starts gated again.
    const fresh = createCanvasService({ workspace });
    expect(textOf(await fresh.call("canvas_create", { canvas: "after", title: "After" }))).toBe(WORKFLOW_GATE);
  });

  test("canvas_open returns the OPENED line, the STYLE line and the board state, and its description holds only the argument rules", async () => {
    const service = createCanvasService({ workspace });
    const opened = textOf(await service.call("canvas_open", { canvas: "v2-flow" }));
    const blocks = opened.split("\n\n");
    expect(blocks[0]).toMatch(/^OPENED · v2-flow ".*" · canvases\/v2-flow\.canvas\.json · sha256:[0-9a-f]{64}$/);
    expect(blocks[1]).toBe("STYLE · theme schematic-light");
    expect(blocks.slice(2).map((block) => block.split("\n")[0]!.split(" ")[0])).toEqual(["DESCRIPTION", "BOARD", "DIAGNOSTICS"]);
    const description = service.listTools().find((tool) => tool.name === "canvas_open")!.description;
    expect(description).toBe(
      "Open a board as the one every other canvas tool edits: a canvas id from canvas_list, or the path of a .canvas.json file inside the workspace. Returns the OPENED line, the STYLE line and the board state.",
    );
    // The theme rule that the description held is served in topic rules.
    expect(textOf(await service.call("canvas_guidance", { topic: "rules" }))).toContain("The theme is the person's workspace choice, and no tool changes it");
  });

  test("the contact sheet is a listed resource that reads as a PNG", async () => {
    const service = createCanvasService({ workspace });
    expect(service.listResources()).toEqual([expect.objectContaining({ uri: "codecaine://canvas/contact-sheet", name: "contact-sheet", mimeType: "image/png" })]);
    const sheet = await service.readResource("codecaine://canvas/contact-sheet");
    expect(sheet).toMatchObject({ uri: "codecaine://canvas/contact-sheet", mimeType: "image/png" });
    expect(Buffer.from(sheet!.blob, "base64").subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(await service.readResource("codecaine://canvas/other")).toBeNull();
  });
});
