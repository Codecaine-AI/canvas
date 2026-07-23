import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../../../../canvas/src/state/actions/reducer.ts";
import { isDeepStrictEqual } from "node:util";

const [canvasId, operationsPath, summaryPath] = process.argv.slice(2);
if (!canvasId || !operationsPath || !summaryPath) {
  throw new Error("usage: bun _materialize.ts <canvas-id> <operations.json> <summary.txt>");
}

const endpoint = `http://localhost:4000/api/canvases/${encodeURIComponent(canvasId)}`;
const beforeResponse = await fetch(endpoint);
if (!beforeResponse.ok) throw new Error(`GET before failed: ${beforeResponse.status}`);
const beforePayload = await beforeResponse.json() as { canvas: unknown };
const operations = JSON.parse(await Bun.file(operationsPath).text());
const summary = await Bun.file(summaryPath).text();

const state = createInteractiveCanvasState(beforePayload.canvas as never);
const next = reduceInteractiveCanvasState(state, {
  type: "canvas.applyAgentPatch",
  operations,
  summary,
});

const putResponse = await fetch(endpoint, {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ canvas: next.document }),
});
if (!putResponse.ok) throw new Error(`PUT failed: ${putResponse.status} ${await putResponse.text()}`);

const afterResponse = await fetch(endpoint);
if (!afterResponse.ok) throw new Error(`GET after failed: ${afterResponse.status}`);
const afterPayload = await afterResponse.json() as { canvas: unknown };
const expected = structuredClone(next.document) as { connections: Array<{ arrow?: string }> };
for (const connection of expected.connections) {
  connection.arrow ??= "forward";
}
if (!isDeepStrictEqual(afterPayload.canvas, expected)) {
  throw new Error("PUT/GET verification mismatch");
}

process.stdout.write(JSON.stringify({
  objectCount: (next.document as { objects: unknown[] }).objects.length,
  connectionCount: (next.document as { connections: unknown[] }).connections.length,
  annotationCount: ((next.document as { annotations?: unknown[] }).annotations ?? []).length,
}));
