/** `climb <draw | critic | render | score>`: the quality climb's round tools. */
import { runCritique } from "./critic.ts";
import { runDraw } from "./draw.ts";
import { runRender } from "./render.ts";
import { runScore } from "./score.ts";

export async function runClimb(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === "draw") await runDraw(rest);
  else if (command === "critic") await runCritique(rest);
  else if (command === "render") await runRender(rest);
  else if (command === "score") await runScore(rest);
  else throw new Error("Usage: climb draw --round <n> [--set climb|heldOut|all] [--briefs a,b] [--critic on|off] [--critic-grid auto|3x2] [--critic-count <n>] | climb critic --board <canvas.json> --out <dir> [--critic-grid auto|3x2] [--critic-count <n>] | climb render --round <n> [--lint-root <path>] [--view-width <px>] | climb score --round <n> --stage 1|2|3");
}
