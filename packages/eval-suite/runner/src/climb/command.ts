/** `climb <draw | render>`: the quality climb's round tools. */
import { runDraw } from "./draw.ts";
import { runRender } from "./render.ts";

export async function runClimb(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === "draw") await runDraw(rest);
  else if (command === "render") await runRender(rest);
  else throw new Error("Usage: climb draw --round <n> [--set climb|heldOut|all] [--briefs a,b] | climb render --round <n> [--lint-root <path>]");
}
