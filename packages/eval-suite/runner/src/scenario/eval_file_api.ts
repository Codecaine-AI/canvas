import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";

import { createCanvasFileApiHandler } from "../../../../studio/server/canvas-file-api.ts";

const repoRoot = resolve(import.meta.dir, "../../../../..");
const canvasesDir = resolve(repoRoot, "canvases", "evals");
const port = Number(Bun.env.EVAL_FILE_API_PORT ?? 4010);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid EVAL_FILE_API_PORT: ${Bun.env.EVAL_FILE_API_PORT}`);
}

await mkdir(canvasesDir, { recursive: true });
const canvasHandler = createCanvasFileApiHandler({ canvasesDir });
const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.statusCode = 200;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(`${JSON.stringify({ status: "ok", canvases_dir: canvasesDir })}\n`);
    return;
  }
  canvasHandler(request, response, () => {
    response.statusCode = 404;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end('{"error":"Not found."}\n');
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`eval canvas file API listening on http://127.0.0.1:${port}`);
  console.log(`Canvas directory: ${canvasesDir}`);
});

function shutdown(): void {
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
