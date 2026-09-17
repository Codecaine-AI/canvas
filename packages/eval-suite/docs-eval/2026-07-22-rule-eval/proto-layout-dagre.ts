// Dagre layered-layout prototype: same semantics as eval-v3-state-machine,
// geometry 100% derived; rendered through the repo's real static renderer.
import dagre from "@dagrejs/dagre";
import { readFileSync, writeFileSync } from "node:fs";
// @ts-ignore — repo-internal import
import { renderDocumentToSvg } from "/Users/Ford/Github Repos/Codecaine/canvas/packages/canvas/src/render/static-svg";
// @ts-ignore
import { rasterizeSvgToPng } from "/Users/Ford/Github Repos/Codecaine/canvas/packages/canvas-agent/src/harness/render";

const SRC = "/Users/Ford/Github Repos/Codecaine/canvas/canvases/eval-v3-state-machine.canvas.json";
const doc = JSON.parse(readFileSync(SRC, "utf8"));

const GRID = 16;
const snap = (v: number) => Math.round(v / GRID) * GRID;

const nodes = doc.objects.filter((o: any) => o.type !== "section" && o.type !== "sticky");
const stickies = doc.objects.filter((o: any) => o.type === "sticky");
const frame = doc.objects.find((o: any) => o.id === "page-frame");

const g = new dagre.graphlib.Graph({ multigraph: true });
g.setGraph({
  rankdir: "LR",
  ranksep: 128,  // ladder: cluster corridor — room for edge labels between ranks
  nodesep: 64,   // ladder: spaced
  edgesep: 32,   // ladder: packed
  marginx: 0,
  marginy: 0,
});
g.setDefaultEdgeLabel(() => ({}));
for (const o of nodes) {
  g.setNode(o.id, { width: o.geometry.width, height: o.geometry.height });
}
for (const c of doc.connections) {
  g.setEdge(c.from.objectId, c.to.objectId, {
    width: c.label ? c.label.length * 8 + 24 : 0,
    height: c.label ? 32 : 0,
    labelpos: "c",
  }, c.id);
}
dagre.layout(g);

const MX = 160, MY = 160;
const byId = new Map(doc.objects.map((o: any) => [o.id, o]));
for (const id of g.nodes()) {
  const n = g.node(id);
  const o: any = byId.get(id);
  o.geometry = {
    x: snap(n.x - n.width / 2 + MX),
    y: snap(n.y - n.height / 2 + MY),
    width: o.geometry.width,
    height: o.geometry.height,
  };
}
// Dagre edge points → waypoints (drop first/last, the renderer anchors at boxes).
const connById = new Map(doc.connections.map((c: any) => [c.id, c]));
for (const e of g.edges()) {
  const info = g.edge(e);
  const c = connById.get(e.name!);
  if (!c) continue;
  const pts = (info.points ?? []).slice(1, -1);
  if (pts.length) c.waypoints = pts.map((p: any) => [snap(p.x + MX), snap(p.y + MY)]);
  else delete c.waypoints;
}
// Stickies to the right margin.
const extentX = Math.max(...nodes.map((o: any) => o.geometry.x + o.geometry.width));
let sy = MY;
for (const s of stickies) {
  s.geometry = { ...s.geometry, x: snap(extentX + 128), y: snap(sy) };
  sy += s.geometry.height + 64;
}
// Shrink-wrap the frame.
const all = doc.objects.filter((o: any) => o.id !== "page-frame");
const maxX = Math.max(...all.map((o: any) => o.geometry.x + o.geometry.width));
const maxY = Math.max(...all.map((o: any) => o.geometry.y + o.geometry.height));
frame.geometry = { x: 32, y: 32, width: snap(maxX + 96 - 32), height: snap(maxY + 96 - 32) };
doc.size = { width: frame.geometry.width + 64, height: frame.geometry.height + 64 };

const rendered = renderDocumentToSvg(doc, { fit: "content", padding: 48, width: 1600 });
writeFileSync("dagre-result.svg", rendered.svg);
writeFileSync("dagre-waypoints.png", rasterizeSvgToPng(rendered.svg).png);
// Variant: let the canvas elbow router own the routing on dagre's node positions.
for (const c of doc.connections) delete (c as any).waypoints;
const rendered2 = renderDocumentToSvg(doc, { fit: "content", padding: 48, width: 1600 });
writeFileSync("dagre-router.png", rasterizeSvgToPng(rendered2.svg).png);
console.log("nodes:", nodes.length, "edges:", doc.connections.length, "→ dagre-waypoints.png / dagre-router.png");
