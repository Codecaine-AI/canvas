/**
 * Headless layout-session driver (HARNESS-SETUP-PLAN §5 phase 3 — the exit
 * criterion). Runs a full session in-process (store + kernel directly, no
 * HTTP), streaming fitted/proposal/delta/lint events to stdout, writing each
 * render_draft PNG to the scratch dir, and printing the final patch
 * operations + summary.
 *
 *   bun run cli --canvas <id> --scope <id,id,…> --instruction "…" [--max-turns N]
 *   bun run cli --list-scopes <id>       print a board's objects to pick from
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { bootKernelDatabase, CANVASES_DIR } from "./service/kernel";
import { LayoutSessionStore } from "./service/session";
import type { AgentSessionEvent } from "./protocol";

interface CliArgs {
  canvas?: string;
  scope?: string;
  instruction?: string;
  listScopes?: string;
  outDir?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    switch (flag) {
      case "--canvas": args.canvas = value; index += 1; break;
      case "--scope": args.scope = value; index += 1; break;
      case "--instruction": args.instruction = value; index += 1; break;
      case "--list-scopes": args.listScopes = value; index += 1; break;
      case "--out-dir": args.outDir = value; index += 1; break;
      default:
        console.error(`Unknown flag: ${flag}`);
        process.exit(2);
    }
  }
  return args;
}

function usage(): never {
  console.error(
    "Usage:\n"
    + '  bun run cli --canvas <id> --scope <id,id,…> --instruction "…" [--out-dir <dir>]\n'
    + "  bun run cli --list-scopes <id>",
  );
  process.exit(2);
}

function listScopes(canvasId: string): void {
  const path = join(CANVASES_DIR, `${canvasId}.canvas.json`);
  const document = JSON.parse(readFileSync(path, "utf8")) as InteractiveCanvasDocument;
  console.log(`${document.title ?? canvasId} — ${document.objects.length} objects, ${document.connections.length} connections\n`);
  for (const object of document.objects) {
    const { x, y, width, height } = object.geometry;
    const text = object.text.replace(/\s+/g, " ").slice(0, 60);
    console.log(`${object.id.padEnd(36)} ${object.type.padEnd(10)} ${String(Math.round(width)).padStart(4)}×${String(Math.round(height)).padEnd(4)} @ (${Math.round(x)},${Math.round(y)})  ${JSON.stringify(text)}`);
  }
}

const args = parseArgs(process.argv.slice(2));

if (args.listScopes) {
  listScopes(args.listScopes);
  process.exit(0);
}

if (!args.canvas || !args.scope || !args.instruction) usage();

const scopeObjectIds = args.scope.split(",").map((id) => id.trim()).filter(Boolean);
const outDir = args.outDir
  ?? Bun.env.CLI_RENDER_DIR
  ?? join(process.cwd(), ".agent-kernel", "cli-renders");
mkdirSync(outDir, { recursive: true });

const boot = await bootKernelDatabase();
const store = new LayoutSessionStore(boot.db);
store.onRender = (sid, png, index) => {
  const file = join(outDir, `${sid.slice(0, 8)}-render-${String(index).padStart(2, "0")}.png`);
  writeFileSync(file, png);
  console.log(`   wrote ${file}`);
};

let renderIndex = 0;

function printEvent(event: AgentSessionEvent): void {
  switch (event.type) {
    case "fitted":
      console.log(`\n== fitted: ${event.scopeObjectIds.length} objects, frame ${Math.round(event.frame.width)}×${Math.round(event.frame.height)} at (${event.frame.x},${event.frame.y}), ${event.boundaryArrowCount} boundary arrow(s) ==`);
      break;
    case "proposal":
      console.log(`\n== proposal ${event.n} ==`);
      break;
    case "delta":
      console.log(event.delta);
      console.log(event.lint);
      break;
    case "rendering":
      renderIndex += 1;
      console.log(`\n== rendering draft (render ${renderIndex}) ==`);
      break;
    case "proposal-ready":
      console.log(`\n== proposal-ready: ${event.proposal.summary} ==`);
      break;
    case "abandoned":
      console.log(`\n== abandoned: ${event.reason} ==`);
      break;
    case "error":
      console.log(`\n== error: ${event.message} ==`);
      break;
    case "status":
      console.log(`\n== status: ${event.status} ==`);
      break;
  }
}

console.log(`canvas-agent CLI — canvas ${args.canvas}, scope [${scopeObjectIds.join(", ")}]`);
console.log(`instruction: ${args.instruction}`);
console.log(`renders: ${outDir}`);

const session = await store.createSession({
  canvasId: args.canvas,
  scopeObjectIds,
  instruction: args.instruction,
});
const sessionId = session.id;
store.subscribe(sessionId, printEvent);

await session.runPromise;

const finalState = store.stateOf(store.get(sessionId));
console.log(`\n== final status: ${finalState.status} ==`);
if (finalState.proposal) {
  console.log(`summary: ${finalState.proposal.summary}`);
  console.log("operations:");
  console.log(JSON.stringify(finalState.proposal.operations, null, 2));
} else if (finalState.error) {
  console.log(`error: ${finalState.error}`);
}

store.kernel.dispose();
boot.close();
process.exit(finalState.status === "proposal-ready" || finalState.status === "abandoned" ? 0 : 1);
