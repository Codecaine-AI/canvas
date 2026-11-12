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
 * is spent. A check round then reviews the board the last revise left, so
 * every board the loop leaves has a score, and the loop keeps the board that
 * scored best (bestRound).
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
import type { ProposedCall } from "./review-types.ts";
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
  /** The calls the reviewers proposed for it. A lint has none. */
  calls: ProposedCall[];
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
  /** A check round only scores the board a revise pass left: it comes after the budget's last revise, or after a revise that failed, and has no revise. */
  check: boolean;
  /** 3 for each blocker and 1 for each should this round found, the lints among them. Lower is better. */
  score: number;
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

/** The round whose board the loop left in the board file. */
export interface Kept {
  round: number;
  /** True when that round is not the last: the loop put its snapshot back over the board file. */
  restored: boolean;
  reason: string;
}

export interface LoopRecord {
  /** The most revise passes. A check round comes on top of it. */
  budget: number;
  rounds: RoundRecord[];
  /**
   * clean: the last round had no blocker and no should. budget: the rounds
   * ran out. review-only: no drawer to revise. failed: a step broke (error).
   */
  stop: "clean" | "budget" | "review-only" | "failed";
  error: string | null;
  /** Null when the loop could not choose: no drawer, or no review of the last board. */
  kept: Kept | null;
  durationMs: number;
}

const LINT_SEVERITY: Record<string, Severity> = { error: "blocker", warning: "should", note: "nit" };
const rank = (finding: { severity: Severity }) => SEVERITIES.indexOf(finding.severity);
/** A finding the loop does not stop on. */
const isOpen = (finding: { severity: Severity }) => finding.severity !== "nit";
const SCORE_WEIGHT: Record<Severity, number> = { blocker: 3, should: 1, nit: 0 };
const scoreOf = (findings: LoopFinding[]) => findings.reduce((sum, finding) => sum + SCORE_WEIGHT[finding.severity], 0);

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
      ids: lint.at, labels: [], problem: lint.message, fix: lint.suggestion ?? "", regions: [], calls: [], answer: null,
    };
    findings.push({ id: raised.get(key(fresh)) ?? `F${next++}`, ...fresh });
  }
  for (const finding of review.findings) {
    findings.push({
      id: `F${next++}`, source: "reviewer", severity: finding.severity, kind: finding.kind,
      ids: finding.ids, labels: finding.labels, problem: finding.problem, fix: finding.fix, regions: finding.regions, calls: finding.calls, answer: null,
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
 * The round whose board the loop keeps, given that the last round reviewed
 * the board as it stands: the lowest score, and on a tie the later round.
 *
 * The score is a sample, not a measure. The critics differ from run to run,
 * so two reviews of one board can score a few points apart. A later round's
 * critics also read what the drawer declined and do not report it again, so
 * a later board scores lower than a fresh review would score it. An earlier
 * round wins only against that lean. A round that lost a critic's answer
 * undercounts. As an earlier round it cannot win. As the last round it loses
 * only to a full review that scored less than its undercount.
 */
export function bestRound(rounds: RoundRecord[]): Kept | null {
  const last = rounds.at(-1);
  if (!last) return null;
  const full = (round: RoundRecord) => round.unparsed === 0;
  const orMore = full(last) ? "" : " or more";
  const best = rounds.filter((round) => full(round) || round === last).reduce((low, round) => round.score <= low.score ? round : low);
  if (best !== last) return { round: best.round, restored: true, reason: `round ${best.round} scored ${best.score}, and the last board (round ${last.round}) scored ${last.score}${orMore}` };
  const level = rounds.findLast((round) => round !== last && full(round) && round.score === last.score);
  let reason = `round ${last.round} is the last board and scored ${last.score}, the best of the loop`;
  if (!full(last)) reason = `round ${last.round} is the last board. Its review lost ${last.unparsed} of ${last.regions} regions, so it scored ${last.score} or more, and no full review scored less than ${last.score}`;
  else if (level) reason = `round ${last.round} is the last board and scored ${last.score}, level with round ${level.round}: a tie keeps the later board`;
  return { round: last.round, restored: false, reason };
}

/**
 * The loop itself. `review` is one review of the board as it stands, given
 * the critics' findings of the earlier rounds. `revise` hands a round's
 * findings to the drawer and returns its run and its closing reply.
 * `restore` puts back the board a round reviewed. The loop calls it when an
 * earlier round's board scored better than the last one (bestRound).
 *
 * A round is clean when it has no blocker and no should and every critic
 * answered: a critic that timed out or failed did not approve. The budget's
 * last round still goes to the drawer, and so does a round whose revise then
 * fails. A check round reviews what that revise left, and nothing revises it.
 */
export async function reviewLoop(options: {
  budget: number;
  review(round: number, earlier: EarlierFinding[]): Promise<Review>;
  revise?(round: number, findings: LoopFinding[]): Promise<{ run: DrawerRun; reply: string }>;
  restore?(round: number): void;
}): Promise<LoopRecord> {
  const started = Date.now();
  const rounds: RoundRecord[] = [];
  const ledger = () => rounds.flatMap((record) => record.findings);
  /** True while a revise pass may have changed the board since its last review. */
  let unreviewed = false;
  const loop = async (): Promise<Pick<LoopRecord, "stop" | "error">> => {
    const done = (stop: LoopRecord["stop"], error: string | null = null) => ({ stop, error });
    /** Why the last revise failed. The next round is then the check round. */
    let failure: string | null = null;
    try {
      for (let round = 1; ; round += 1) {
        const check = round > options.budget || failure !== null;
        const review = await options.review(round, ledger().filter((finding) => finding.source === "reviewer").map(earlierFinding));
        const findings = roundFindings(ledger(), review);
        const record: RoundRecord = {
          round, check, score: scoreOf(findings),
          reviewMs: review.reviewMs, renderMs: review.renderMs, regions: review.regions, unparsed: review.unparsed,
          findings, revise: null,
        };
        rounds.push(record);
        unreviewed = false;
        if (failure !== null) return done("failed", failure);
        const open = findings.some(isOpen);
        if (!open && review.unparsed === 0) return done("clean");
        if (!options.revise) return done("review-only");
        if (check || (!open && round === options.budget)) return done("budget");
        if (!open) continue;
        unreviewed = true;
        const { run, reply } = await options.revise(round, findings);
        const answers = parseAnswers(reply);
        for (const finding of findings) finding.answer = answers.get(finding.id) ?? null;
        record.revise = { ...run, answered: findings.filter((finding) => finding.answer).length };
        if (run.exitCode !== 0) failure = `round ${round}: the revise pass ${run.timedOut ? "timed out" : `exited ${run.exitCode ?? run.signal}`}`;
      }
    } catch (error) {
      return done("failed", failure === null ? message(error) : `${failure}; then its check round failed: ${message(error)}`);
    }
  };
  const outcome = await loop();
  const kept = options.restore && !unreviewed ? bestRound(rounds) : null;
  if (kept?.restored) options.restore!(kept.round);
  return { budget: options.budget, rounds, ...outcome, kept, durationMs: Date.now() - started };
}

/** The whole loop's ledger as text: each round's findings, and the drawer's answer under each. */
export function ledgerText(record: LoopRecord): string {
  const lines = record.rounds.flatMap((round) => [
    `## Round ${round.round}${round.check ? " (check round: no revise)" : ""} · score ${round.score}`,
    ...(round.findings.length ? [] : ["No findings."]),
    ...round.findings.flatMap((finding) => [
      findingLine(finding),
      ...(finding.answer ? [`  → ${finding.answer.verdict}${finding.answer.reason ? `: ${finding.answer.reason}` : ""}`] : round.revise ? ["  → no answer"] : []),
    ]),
    "",
  ]);
  const kept = record.kept ? `Kept: round ${record.kept.round}${record.kept.restored ? ", restored" : ""}. ${sentence(record.kept.reason)}\n` : "";
  return `${lines.join("\n")}Stop: ${record.stop}${record.error ? ` (${record.error})` : ""}\n${kept}`;
}

/**
 * The loop on one board file. Writes into `outDir`: `round-<n>/` per round
 * (board.canvas.json and overview.png: the board as that round reviewed it;
 * guides.png, regions/ and critique.json from critic.ts; and
 * revise-transcript.jsonl), after.png (the board the loop kept), loop.json (a
 * LoopRecord) and findings.md (the ledger as text).
 *
 * The board file ends as the kept round's board. Each revise pass has exited
 * by then, and the canvas server saves inside a tool call, so nothing writes
 * the file after a restore.
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
    restore: drawer && ((round) => copyFileSync(resolve(roundDir(round), "board.canvas.json"), boardPath)),
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
  const checks = record.rounds.filter((round) => round.check).length;
  return `stop ${record.stop} after ${record.rounds.length - checks} of ${record.budget} rounds${checks ? " and a check round" : ""}`
    + ` · last round: ${SEVERITIES.map((severity) => `${count(severity)} ${severity}`).join(", ")}`
    + `${record.kept ? ` · kept round ${record.kept.round}${record.kept.restored ? " (restored)" : ""}` : ""}`
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
