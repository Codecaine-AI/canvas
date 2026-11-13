/** `climb <draw | critic | render | score>`: the quality climb's round tools. */
import { runCritique } from "./critic-loop.ts";
import { runDraw } from "./draw.ts";
import { runRender } from "./render.ts";
import { runScore } from "./score.ts";

const CRITIC_USAGE = "[--critic-count <n>] [--critic-rounds <n>] [--critic-effort auto|medium|high] [--revise-timeout-min <n>] [--loop-timeout-min <n>]";

export async function runClimb(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  if (command === "draw") await runDraw(rest);
  else if (command === "critic") await runCritique(rest);
  else if (command === "render") await runRender(rest);
  else if (command === "score") await runScore(rest);
  else throw new Error(`Usage: climb draw --round <n> [--set climb|heldOut|all] [--briefs a,b] [--parallel <n>] [--brief-dir <dir with index.json and <id>.md>] [--critic on|off] ${CRITIC_USAGE} | climb critic --board <canvas.json> --out <dir> [--brief <brief.md>] [--revise on|off] ${CRITIC_USAGE} | climb render --round <n> [--lint-root <path>] [--view-width <px>] | climb score --round <n> --stage 1|2|3`);
}
