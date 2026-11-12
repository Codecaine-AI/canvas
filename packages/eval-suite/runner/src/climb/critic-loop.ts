/**
 * The critic loop: review, revise, review again, as the Sol loop runs a code
 * review. Ford: "we have the reviewers that then, like, in parallel, look
 * across the board and come back with findings and go back and forth similar
 * to how we run the sole loop for our system for code changes."
 *
 * A round is one review (critic.ts): the lints canvas_check runs, plus the
 * region critics. Each finding is a blocker, a should or a nit, and keeps one
 * id (F1, F2, ...) for the whole loop. The drawer revises in its own session
 * and answers each finding: fixed, disagree or declined. The loop stops at
 * the first round with no blocker and no should, or when its budget of rounds
 * is spent.
 *
 * `climb draw --critic on` runs the loop after the drawer's first pass
 * (draw.ts). `climb critic --board <path> --out <dir>` runs one review of a
 * frozen board, and with `--revise on` the whole loop on a copy of it, with a
 * new drawer session that stands in for the one that drew the board.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import {
  CRITIC_FLAGS, SEVERITIES, critiqueBoard, critiqueSummary, loadReviewCanvas, parseCritic,
  type CriticOptions, type EarlierFinding, type MergedFinding, type ReviewCanvas, type Severity,
} from "./critic.ts";
import { drawerArgs, drawerFlags, replyOf, runDrawer, sessionIdOf, type DrawerRun } from "./drawer.ts";
import { parseFlags } from "./paths.ts";
import { renderBoardPng, type Lint } from "./render.ts";

export const VERDICTS = ["fixed", "disagree", "declined"] as const;
export type Verdict = (typeof VERDICTS)[number];
/** The drawer's answer to one finding. */
export interface Answer { verdict: Verdict; reason: string }

export interface LoopFinding {
  /** F1, F2, ...: one id for the whole loop. */
  id: string;
  /** check: a canvas_check lint. reviewer: the region critics. */
  source: "check" | "reviewer";
  severity: Severity;
  /** The lint's rule, or the reviewer's finding kind. */
  kind: string;
  ids: string[];
  labels: string[];
  problem: string;
  fix: string;
  /** The regions whose critics reported it. */
  regions: string[];
  /** The drawer's answer after its revise pass, or null when it gave none. */
  answer: Answer | null;
}

/** What one review found (critic.ts), as the loop reads it. */
export interface Review {
  reviewMs: number;
  renderMs: number;
  regions: number;
  /** Regions whose critic gave no answer. */
  unparsed: number;
  lints: Lint[];
  findings: MergedFinding[];
}

export interface RoundRecord {
  round: number;
  /** Wall clock of the review: lints, renders, critics and the merge. */
  reviewMs: number;
  renderMs: number;
  regions: number;
  unparsed: number;
  /** This round's findings, most severe first, each with the drawer's answer once it revised. */
  findings: LoopFinding[];
  /** The drawer's revise pass and how many findings its reply answered, or null when the round had none. */
  revise: (DrawerRun & { answered: number }) | null;
}

export interface LoopRecord {
  budget: number;
  rounds: RoundRecord[];
  /**
   * clean: the last round had no blocker and no should. budget: the rounds
   * ran out. review-only: no drawer to revise. failed: a step broke (error).
   */
  stop: "clean" | "budget" | "review-only" | "failed";
  error: string | null;
  durationMs: number;
}

const LINT_SEVERITY: Record<string, Severity> = { error: "blocker", warning: "should", note: "nit" };
const rank = (finding: { severity: Severity }) => SEVERITIES.indexOf(finding.severity);
/** A finding the loop does not stop on. */
const isOpen = (finding: { severity: Severity }) => finding.severity !== "nit";

/**
 * One round's findings: the lints, then the critics', most severe first.
 * `ledger` holds every earlier round's findings with the drawer's answers.
 *
 * A lint an earlier round raised keeps its id, and is raised again each round
 * until it is off the board, whatever the drawer answered: a round counts
 * what the board still has. The critics read the earlier findings and answers
 * themselves, so each finding they return is new.
 */
export function roundFindings(ledger: LoopFinding[], review: Pick<Review, "lints" | "findings">): LoopFinding[] {
  const key = (finding: Pick<LoopFinding, "kind" | "ids" | "problem">) => JSON.stringify([finding.kind, finding.ids, finding.problem]);
  const raised = new Map(ledger.filter((finding) => finding.source === "check").map((finding) => [key(finding), finding.id]));
  let next = 1 + Math.max(0, ...ledger.map((finding) => Number(finding.id.slice(1))));
  const findings: LoopFinding[] = [];
  for (const lint of review.lints) {
    const fresh = {
      source: "check" as const, severity: LINT_SEVERITY[lint.severity] ?? "should", kind: lint.rule,
      ids: lint.at, labels: [], problem: lint.message, fix: lint.suggestion ?? "", regions: [], answer: null,
    };
    findings.push({ id: raised.get(key(fresh)) ?? `F${next++}`, ...fresh });
  }
  for (const finding of review.findings) {
    findings.push({
      id: `F${next++}`, source: "reviewer", severity: finding.severity, kind: finding.kind,
      ids: finding.ids, labels: finding.labels, problem: finding.problem, fix: finding.fix, regions: finding.regions, answer: null,
    });
  }
  // The sort is stable: a lint stays ahead of the critics' findings of its severity.
  return findings.sort((a, b) => rank(a) - rank(b));
}

const names = (finding: LoopFinding) => [...finding.ids, ...finding.labels.map((label) => JSON.stringify(label))].join(", ");
const sentence = (text: string) => /[.!?]$/.test(text) ? text : `${text}.`;

/** One finding as the drawer reads it. A lint's message names its items itself. */
export function findingLine(finding: LoopFinding): string {
  const tag = finding.source === "check" ? `check ${finding.kind}` : finding.kind;
  const subject = finding.source === "reviewer" && names(finding) ? `${names(finding)}: ` : "";
  return `${finding.id} [${finding.severity}, ${tag}] ${subject}${sentence(finding.problem)}${finding.fix ? ` Fix: ${finding.fix}` : ""}`;
}

/** A critic's finding of an earlier round as the next round's critics read it, with the drawer's answer. */
function earlierFinding(finding: LoopFinding): EarlierFinding {
  const answer = finding.answer ? `${finding.answer.verdict}${finding.answer.reason ? `, ${finding.answer.reason}` : ""}` : "no answer";
  return { ids: finding.ids, regions: finding.regions, line: `[${finding.kind}] ${names(finding)}: ${sentence(finding.problem)} Drawer: ${answer}` };
}

/** The drawer's revise turn, in its own session, after a review. */
export function revisePrompt(board: string, findings: LoopFinding[]): string {
  return [
    "Reviewers looked at your board: the canvas_check lints, and critics that read it region by region. Their findings are below, most severe first.",
    "blocker: a reader misreads the board, or something is broken, hidden or cut off. should: clearly off, and a tool call or two fixes it. nit: polish.",
    "Fix each blocker and each should you agree with, using the canvas tools. Fix a nit only when one call does it.",
    "Skip a finding that is wrong or that would break something else.",
    `The canvas server restarted. Open the board again with canvas_open, canvas id "${board}", and read any guidance topic it asks for.`,
    "Run canvas_check when you are done.",
    "End your reply with one line per finding, and nothing after them:",
    "<id> fixed",
    "<id> disagree: <why the finding is wrong>",
    "<id> declined: <why you left it>",
    "",
    "<findings>",
    ...findings.map(findingLine),
    "</findings>",
  ].join("\n");
}

/** The drawer's answers in its closing reply: `F3 fixed`, `F4 disagree: <why>`, with or without list marks and bold. */
export function parseAnswers(reply: string): Map<string, Answer> {
  const answers = new Map<string, Answer>();
  for (const line of reply.split("\n")) {
    const match = /^\W*((?:F\d+\W+)+)(fixed|disagree|declined)\b\W*(.*)$/i.exec(line);
    if (!match) continue;
    const answer: Answer = { verdict: match[2]!.toLowerCase() as Verdict, reason: match[3]!.replace(/[\s*|]+$/, "") };
    for (const id of match[1]!.match(/F\d+/gi)!) answers.set(id.toUpperCase(), answer);
  }
  return answers;
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * The loop itself. `review` is one review of the board as it stands, given
 * the critics' findings of the earlier rounds. `revise` hands a round's
 * findings to the drawer and returns its run and its closing reply.
 *
 * A round is clean when it has no blocker and no should and every critic
 * answered: a critic that timed out or failed did not approve. The last
 * round's findings still go to the drawer, as the one round did before.
 */
export async function reviewLoop(options: {
  budget: number;
  review(round: number, earlier: EarlierFinding[]): Promise<Review>;
  revise?(round: number, findings: LoopFinding[]): Promise<{ run: DrawerRun; reply: string }>;
}): Promise<LoopRecord> {
  const started = Date.now();
  const rounds: RoundRecord[] = [];
  const done = (stop: LoopRecord["stop"], error: string | null = null): LoopRecord =>
    ({ budget: options.budget, rounds, stop, error, durationMs: Date.now() - started });
  const ledger = () => rounds.flatMap((record) => record.findings);
  try {
    for (let round = 1; round <= options.budget; round += 1) {
      const review = await options.review(round, ledger().filter((finding) => finding.source === "reviewer").map(earlierFinding));
      const findings = roundFindings(ledger(), review);
      const record: RoundRecord = {
        round, reviewMs: review.reviewMs, renderMs: review.renderMs, regions: review.regions, unparsed: review.unparsed,
        findings, revise: null,
      };
      rounds.push(record);
      if (!findings.some(isOpen)) {
        if (review.unparsed === 0) return done("clean");
        if (!options.revise) return done("review-only");
        continue;
      }
      if (!options.revise) return done("review-only");
      const { run, reply } = await options.revise(round, findings);
      const answers = parseAnswers(reply);
      for (const finding of findings) finding.answer = answers.get(finding.id) ?? null;
      record.revise = { ...run, answered: findings.filter((finding) => finding.answer).length };
      if (run.exitCode !== 0) {
        return done("failed", `round ${round}: the revise pass ${run.timedOut ? "timed out" : `exited ${run.exitCode ?? run.signal}`}`);
      }
    }
    return done("budget");
  } catch (error) {
    return done("failed", message(error));
  }
}

/** The whole loop's ledger as text: each round's findings, and the drawer's answer under each. */
export function ledgerText(record: LoopRecord): string {
  const lines = record.rounds.flatMap((round) => [
    `## Round ${round.round}`,
    ...(round.findings.length ? [] : ["No findings."]),
    ...round.findings.flatMap((finding) => [
      findingLine(finding),
      ...(finding.answer ? [`  → ${finding.answer.verdict}${finding.answer.reason ? `: ${finding.answer.reason}` : ""}`] : round.revise ? ["  → no answer"] : []),
    ]),
    "",
  ]);
  return `${lines.join("\n")}Stop: ${record.stop}${record.error ? ` (${record.error})` : ""}\n`;
}

/**
 * The loop on one board file. Writes into `outDir`: `round-<n>/` per round
 * (board.canvas.json and overview.png: the board as that round reviewed it;
 * guides.png, regions/ and critique.json from critic.ts; and
 * revise-transcript.jsonl), after.png (the board after the last revise pass),
 * loop.json (a LoopRecord) and findings.md (the ledger as text).
 */
export async function reviewBoard(options: {
  canvas: ReviewCanvas;
  /** The canvas id the drawer opens the board by. */
  board: string;
  boardPath: string;
  outDir: string;
  critic: CriticOptions;
  /**
   * The drawer that revises: its folder (the canvas server's workspace, with
   * the board in canvases/), and the session to resume. Without a session the
   * first revise pass starts one. Undefined: one review, no revise.
   */
  drawer?: { dir: string; settingsPath: string; timeoutMs: number; session?: string };
}): Promise<LoopRecord> {
  const { canvas, board, boardPath, outDir, drawer } = options;
  const budget = options.critic.rounds;
  const roundDir = (round: number) => resolve(outDir, `round-${round}`);
  let session = drawer?.session;
  const record = await reviewLoop({
    budget,
    review: async (round, earlier) => {
      mkdirSync(roundDir(round), { recursive: true });
      copyFileSync(boardPath, resolve(roundDir(round), "board.canvas.json"));
      const critique = await critiqueBoard({ canvas, boardPath, outDir: roundDir(round), critic: options.critic, earlier });
      process.stdout.write(`${board}: review ${round} · ${critiqueSummary(critique)}\n`);
      return {
        reviewMs: critique.durationMs,
        renderMs: critique.renderMs,
        regions: critique.regions.length,
        unparsed: critique.regions.filter((region) => region.error !== null).length,
        lints: critique.lints,
        findings: critique.findings,
      };
    },
    revise: drawer && (async (round, findings) => {
      const transcriptPath = resolve(roundDir(round), "revise-transcript.jsonl");
      // The session stays on disk while a later round can still resume it.
      const args = drawerArgs(drawer.dir, revisePrompt(board, findings), drawer.settingsPath, { persist: round < budget, resume: session });
      const run = await runDrawer(drawer.dir, args, transcriptPath, drawer.timeoutMs);
      const transcript = readFileSync(transcriptPath, "utf8");
      session = sessionIdOf(transcript) ?? session;
      process.stdout.write(`${board}: revise ${round} · exit ${run.exitCode ?? run.signal}${run.timedOut ? " (timed out)" : ""} · ${Math.round(run.durationMs / 1000)} s\n`);
      return { run, reply: replyOf(transcript) };
    }),
  });
  if (record.rounds.some((round) => round.revise)) {
    writeFileSync(resolve(outDir, "after.png"), renderBoardPng(canvas, canvas.toolkit.openCanvasFile(boardPath), undefined).png);
  }
  writeFileSync(resolve(outDir, "loop.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(resolve(outDir, "findings.md"), ledgerText(record));
  return record;
}

export function loopSummary(record: LoopRecord): string {
  const last = record.rounds.at(-1);
  const count = (severity: Severity) => last?.findings.filter((finding) => finding.severity === severity).length ?? 0;
  return `stop ${record.stop} after ${record.rounds.length} of ${record.budget} rounds`
    + ` · last round: ${SEVERITIES.map((severity) => `${count(severity)} ${severity}`).join(", ")}`
    + ` · ${Math.round(record.durationMs / 1000)} s${record.error ? ` · ${record.error}` : ""}`;
}

/**
 * `climb critic --board <path> --out <dir> [--critic-grid auto|3x2]
 * [--critic-region-max px] [--critic-count n] [--revise on|off]
 * [--critic-rounds n] [--settings path] [--timeout-min n]`: the critic step alone, on a board some drawer made
 * before. `--revise off` (the default) is one review of the board file.
 * `--revise on` is the whole loop on a copy in `<out>/canvases/`.
 */
export async function runCritique(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, ["--board", "--out", ...CRITIC_FLAGS, "--revise", "--settings", "--timeout-min"]);
  const boardFlag = flags.get("--board");
  const outFlag = flags.get("--out");
  if (!boardFlag || !outFlag) throw new Error("climb critic needs --board <canvas.json> and --out <dir>");
  const revise = flags.get("--revise") ?? "off";
  if (revise !== "on" && revise !== "off") throw new Error(`--revise must be on or off, not ${revise}`);
  const critic = parseCritic(flags);
  const source = resolve(boardFlag);
  if (!existsSync(source)) throw new Error(`No board at ${source}`);
  const outDir = resolve(outFlag);
  const board = basename(source).replace(/\.canvas\.json$/, "");
  let boardPath = source;
  let drawer: { dir: string; settingsPath: string; timeoutMs: number } | undefined;
  if (revise === "on") {
    drawer = { dir: outDir, ...drawerFlags(flags) };
    boardPath = resolve(outDir, "canvases", `${board}.canvas.json`);
    mkdirSync(dirname(boardPath), { recursive: true });
    copyFileSync(source, boardPath);
  }
  const record = await reviewBoard({ canvas: await loadReviewCanvas(), board, boardPath, outDir, critic, drawer });
  process.stdout.write(`${board}: ${loopSummary(record)}\n`);
  if (record.stop === "failed" || record.rounds.some((round) => round.unparsed > 0)) process.exitCode = 1;
}
