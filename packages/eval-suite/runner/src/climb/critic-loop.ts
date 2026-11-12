/**
 * The critic loop: review, revise, review again, as the Sol loop runs a code
 * review. Ford: "we have the reviewers that then, like, in parallel, look
 * across the board and come back with findings and go back and forth similar
 * to how we run the sole loop for our system for code changes."
 *
 * A round is one review (critic.ts): the lints canvas_check runs, plus the
 * reviewers. Each finding is a blocker, a should or a nit, and keeps one id
 * (F1, F2, ...) for the whole loop. A reviewer can propose a canvas call for
 * its finding. The trial run (trial.ts) applies each call to a copy of the
 * board, and the drawer gets the finding, the call, what the call did and the
 * marked images. The drawer revises in its own session and answers each
 * finding: fixed, disagree or declined.
 *
 * Ford: "I see that there's these answers lost. We need to make sure that
 * doesn't happen." The loop checks that every id it sent has an answer, and
 * asks once more in the same session for the ones that have none. An id with
 * no answer after that goes into the next review and the next revise pass,
 * whatever that review finds.
 *
 * The loop stops at the first round with no blocker and no should and no id
 * without an answer, or when its budget of rounds is spent. A check round
 * then reviews the board the last revise left, so every board the loop leaves
 * has a score, and the loop keeps the board that scored best (bestRound).
 *
 * `climb draw --critic on` runs the loop after the drawer's first pass
 * (draw.ts). `climb critic --board <path> --out <dir>` runs one review of a
 * frozen board, and with `--revise on` the whole loop on a copy of it, with a
 * new drawer session that stands in for the one that drew the board.
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import {
  CRITIC_FLAGS, SEVERITIES, critiqueBoard, critiqueSummary, loadReviewCanvas, parseCritic,
  type CriticOptions, type EarlierFinding, type MergedFinding, type ReviewCanvas, type Severity,
} from "./critic.ts";
import { drawerFlags, drawerSession, type DrawerPart, type DrawerRun } from "./drawer.ts";
import { parseFlags } from "./paths.ts";
import type { FindingAdvice, ProposedCall } from "./review-types.ts";
import { renderBoardPng, type Lint } from "./render.ts";
import { trialFindings } from "./trial.ts";

export const VERDICTS = ["fixed", "disagree", "declined"] as const;
export type Verdict = (typeof VERDICTS)[number];
/** The drawer's answer to one finding. */
export interface Answer { verdict: Verdict; reason: string }

export interface LoopFinding {
  /** F1, F2, ...: one id for the whole loop. */
  id: string;
  /** check: a canvas_check lint. reviewer: the whole-board, section and loose-item reviewers. */
  source: "check" | "reviewer";
  severity: Severity;
  /** The lint's rule, or the reviewer's finding kind. */
  kind: string;
  ids: string[];
  labels: string[];
  problem: string;
  fix: string;
  /** The units (board, a section id, loose) whose reviewers reported it. */
  regions: string[];
  /** The calls the reviewers proposed for it. A lint has none. */
  calls: ProposedCall[];
  /** The drawer's answer, or null while it has given none: in its round's revise pass, the re-ask, or a later round's pass. */
  answer: Answer | null;
}

/** What a revise pass carries besides its round's findings. */
export interface ReviseNotes {
  /** Findings of earlier rounds the drawer has not answered. This pass asks for their answers again. */
  unanswered: LoopFinding[];
  /** What the trial run found, for each finding with a call. */
  advice: FindingAdvice[];
  /** Why the trial run gave no advice, or null when it ran or had no call to run. */
  notTrialled: string | null;
}

/** The trial run of one round's calls. */
export interface TrialRecord {
  /** The findings that carried a call, and how many of them the trial gave advice on. */
  findings: number;
  advised: number;
  /** The images the drawer got with the advice. */
  images: number;
  durationMs: number;
  /** Why the trial gave no advice, or null when it ran. */
  error: string | null;
}

/** One revise pass, and what the answer check found after it. */
export interface ReviseRecord extends DrawerRun {
  /** How many of the round's findings the drawer answered, the re-ask's answers among them. */
  answered: number;
  /** The trial run before the pass, or null when no finding carried a call. */
  trial: TrialRecord | null;
  /** The pass that asked again for the ids the reply left out, or null when there was none: the reply answered every id, or the revise pass failed. */
  reask: (DrawerRun & { ids: string[] }) | null;
  /** The ids this pass sent that still have no answer, earlier rounds' among them. */
  unanswered: string[];
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
  /** The drawer's revise pass, or null when the round had none. */
  revise: ReviseRecord | null;
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
   * clean: the last round had no blocker and no should, and every finding
   * the drawer got has its answer. budget: the rounds ran out. incomplete:
   * the rounds ran out and `unanswered` is not empty. review-only: no drawer
   * to revise. failed: a step broke (error).
   */
  stop: "clean" | "incomplete" | "budget" | "review-only" | "failed";
  error: string | null;
  /** The ids the drawer got and never answered. */
  unanswered: string[];
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

const ANSWER_LINES = ["<id> fixed", "<id> disagree: <why the finding is wrong>", "<id> declined: <why you left it>"];
const SECTION_TOOLS: readonly string[] = ["arrange_section", "fit_section"];
/** A call that moves, arranges or fits a section. What the section holds moves with it. */
const movesSection = ({ call }: ProposedCall, sections: ReadonlySet<string>) =>
  SECTION_TOOLS.includes(call.tool) || (call.tool === "move" && sections.has(String(call.args.id)));

/**
 * The drawer's revise turn, in its own session, after a review: the text,
 * then each image of the trial run under its number and its finding.
 * `sections` holds the board's section ids.
 */
export function reviseMessage(board: string, findings: LoopFinding[], notes: Partial<ReviseNotes> & { sections?: ReadonlySet<string> } = {}): DrawerPart[] {
  const { unanswered = [], advice = [], notTrialled = null, sections = new Set<string>() } = notes;
  const sectionMove = (finding: LoopFinding) => finding.calls.some((call) => movesSection(call, sections));
  // The sort is stable: each group stays most severe first.
  const ordered = [...findings].sort((a, b) => Number(sectionMove(b)) - Number(sectionMove(a)));
  const images: Array<{ finding: string; path: string }> = [];
  const blocks = ordered.flatMap((finding) => {
    const trial = advice.find((entry) => entry.finding === finding.id);
    const shown = (trial?.images ?? []).map((path) => images.push({ finding: finding.id, path }));
    return [
      findingLine(finding),
      ...finding.calls.map(({ unit, call }) => `  call from ${unit}: ${JSON.stringify(call)}`),
      ...(trial?.lines ?? []).map((line) => `  ${line}`),
      ...(finding.calls.length && notTrialled !== null ? [`  not trialled: ${notTrialled}`] : []),
      ...(shown.length ? [`  ${shown.length === 1 ? "image" : "images"}: ${shown.join(", ")}`] : []),
    ];
  });
  const text = [
    "Reviewers looked at your board: the canvas_check lints, and reviewers that read the whole board and each part of it. Their findings are below, most severe first.",
    "blocker: a reader misreads the board, or something is broken, hidden or cut off. should: clearly off, and a tool call or two fixes it. nit: polish.",
    "Fix each blocker and each should you agree with, using the canvas tools. Fix a nit only when one call does it.",
    "Skip a finding that is wrong or that would break something else.",
    ...(findings.some((finding) => finding.calls.length) ? [
      `A "call from" line under a finding is one canvas tool call that a reviewer proposes for it, as exact JSON, with the reviewer that sent it. The lines under the calls say what each call did in a trial run on a copy of your board.`,
      "A call is advice, not an order: apply it, do something better, or decline it with a reason.",
    ] : []),
    ...(ordered.some(sectionMove) ? [
      "The findings whose call moves, arranges or fits a section come first. Settle those first: a section takes everything it holds with it, so the numbers in the other calls can change.",
    ] : []),
    ...(images.length ? [
      "The images after this text show the trial runs, each under its number and its finding. Red marks: the board as it is now. Green marks: what the canvas engine drew when the call ran on the copy. Dashed marks: a reviewer's sketch, which no tool has run.",
    ] : []),
    ...(unanswered.length ? [
      "You gave no answer to the findings in <no_answer_yet>, from earlier rounds. Look at the board as it is now, and answer each of them by its id too.",
    ] : []),
    `The canvas server restarted. Open the board again with canvas_open, canvas id "${board}", and read any guidance topic it asks for.`,
    "Run canvas_check when you are done.",
    "End your reply with one line per finding, and nothing after them:",
    ...ANSWER_LINES,
    "",
    "<findings>",
    ...blocks,
    "</findings>",
    ...(unanswered.length ? ["", "<no_answer_yet>", ...unanswered.map(findingLine), "</no_answer_yet>"] : []),
  ].join("\n");
  return [text, ...images.flatMap((image, index) => [`Image ${index + 1} · ${image.finding}`, { image: image.path }])];
}

/** The second ask, in the session of the revise pass, for the ids its reply gave no answer line. */
export function reaskPrompt(ids: string[]): string {
  return [
    `Your reply has no answer line for ${ids.join(", ")}.`,
    "Make no new edits and call no tool. Reply with one line for each of those ids, and nothing else:",
    ...ANSWER_LINES,
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
/** The findings a revise pass sent that the drawer has not answered. */
const unansweredOf = (rounds: RoundRecord[]) =>
  rounds.filter((round) => round.revise).flatMap((round) => round.findings.filter((finding) => !finding.answer));
const idsOf = (findings: LoopFinding[]) => [...new Set(findings.map((finding) => finding.id))];

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
 * the critics' findings of the earlier rounds. `trial` runs the calls a
 * round's findings carry on the board as that round reviewed it. `revise`
 * hands a round's findings to the drawer, with the trial's advice, and
 * returns its run and its closing reply. `reask` asks the drawer once more,
 * in the session of that revise, for the ids its reply did not answer.
 * `restore` puts back the board a round reviewed. The loop calls it when an
 * earlier round's board scored better than the last one (bestRound).
 *
 * A round is clean when it has no blocker and no should and every critic
 * answered: a critic that timed out or failed did not approve. A clean round
 * still goes to the drawer when a finding of an earlier round has no answer.
 * The budget's last round still goes to the drawer, and so does a round whose
 * revise then fails. A check round reviews what that revise left, and nothing
 * revises it.
 *
 * A trial that throws does not stop the round: the drawer gets the findings
 * and their calls, and the reason no call was trialled.
 */
export async function reviewLoop(options: {
  budget: number;
  review(round: number, earlier: EarlierFinding[]): Promise<Review>;
  trial?(round: number, findings: Array<{ id: string; calls: ProposedCall[] }>): Promise<FindingAdvice[]>;
  revise?(round: number, findings: LoopFinding[], notes: ReviseNotes): Promise<{ run: DrawerRun; reply: string }>;
  reask?(round: number, ids: string[]): Promise<{ run: DrawerRun; reply: string }>;
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
        const carried = unansweredOf(rounds);
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
        /** Nothing to send the drawer: only a critic that gave no answer keeps the loop going. */
        const idle = !open && carried.length === 0;
        if (idle && review.unparsed === 0) return done("clean");
        if (!options.revise) return done("review-only");
        if (check || (idle && round === options.budget)) return done(carried.length ? "incomplete" : "budget");
        if (idle) continue;

        const called = findings.filter((finding) => finding.calls.length > 0).map(({ id, calls }) => ({ id, calls }));
        const notes: ReviseNotes = {
          // A lint that is still on the board is among this round's findings, under its old id.
          unanswered: [...new Map(carried.map((finding) => [finding.id, finding])).values()]
            .filter((finding) => !findings.some((now) => now.id === finding.id)),
          advice: [],
          notTrialled: null,
        };
        let trial: TrialRecord | null = null;
        if (options.trial && called.length > 0) {
          const begun = Date.now();
          try { notes.advice = await options.trial(round, called); } catch (error) { notes.notTrialled = message(error); }
          trial = {
            findings: called.length, advised: notes.advice.length, images: notes.advice.reduce((sum, advice) => sum + advice.images.length, 0),
            durationMs: Date.now() - begun, error: notes.notTrialled,
          };
        }

        unreviewed = true;
        const sent = [...findings, ...carried];
        const take = (reply: string) => {
          const answers = parseAnswers(reply);
          for (const finding of sent) finding.answer ??= answers.get(finding.id) ?? null;
        };
        const tally = () => ({ answered: findings.filter((finding) => finding.answer).length, unanswered: idsOf(sent.filter((finding) => !finding.answer)) });
        const { run, reply } = await options.revise(round, findings, notes);
        take(reply);
        // The record stands before the second ask, so a second ask that throws does not lose the ids.
        const revise: ReviseRecord = record.revise = { ...run, ...tally(), trial, reask: null };
        if (revise.unanswered.length > 0 && run.exitCode === 0 && options.reask) {
          const ids = revise.unanswered;
          const second = await options.reask(round, ids);
          take(second.reply);
          Object.assign(revise, tally(), { reask: { ...second.run, ids } });
        }
        if (run.exitCode !== 0) failure = `round ${round}: the revise pass ${run.timedOut ? "timed out" : `exited ${run.exitCode ?? run.signal}`}`;
      }
    } catch (error) {
      return done("failed", failure === null ? message(error) : `${failure}; then its check round failed: ${message(error)}`);
    }
  };
  const outcome = await loop();
  const kept = options.restore && !unreviewed ? bestRound(rounds) : null;
  if (kept?.restored) options.restore!(kept.round);
  return { budget: options.budget, rounds, ...outcome, unanswered: idsOf(unansweredOf(rounds)), kept, durationMs: Date.now() - started };
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
  const unanswered = record.unanswered.length ? `No answer: ${record.unanswered.join(", ")}\n` : "";
  return `${lines.join("\n")}Stop: ${record.stop}${record.error ? ` (${record.error})` : ""}\n${unanswered}${kept}`;
}

/**
 * The loop on one board file. Writes into `outDir`: `round-<n>/` per round
 * (board.canvas.json and overview.png: the board as that round reviewed it;
 * guides.png, units/ and critique.json from critic.ts; trial/ from
 * trial.ts; revise-transcript.jsonl; and revise-reask-transcript.jsonl when
 * the reply left an id without an answer), after.png (the board the loop
 * kept), loop.json (a LoopRecord) and findings.md (the ledger as text). A
 * transcript holds the message the drawer got, its images too, and its reply.
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
  /** Stand-ins for the review and the trial run, for a run that proves the loop alone. */
  hooks?: { critique?: typeof critiqueBoard; trial?: typeof trialFindings };
}): Promise<LoopRecord> {
  const { canvas, board, boardPath, outDir, drawer } = options;
  const { critique: critiqueOf = critiqueBoard, trial = trialFindings } = options.hooks ?? {};
  const roundDir = (round: number) => resolve(outDir, `round-${round}`);
  const reviewed = (round: number) => resolve(roundDir(round), "board.canvas.json");
  const pass = drawer && drawerSession(drawer);
  const passed = (name: string, round: number, run: DrawerRun) =>
    process.stdout.write(`${board}: ${name} ${round} · exit ${run.exitCode ?? run.signal}${run.timedOut ? " (timed out)" : ""} · ${Math.round(run.durationMs / 1000)} s\n`);
  const record = await reviewLoop({
    budget: options.critic.rounds,
    review: async (round, earlier) => {
      mkdirSync(roundDir(round), { recursive: true });
      copyFileSync(boardPath, reviewed(round));
      const critique = await critiqueOf({ canvas, boardPath, outDir: roundDir(round), critic: options.critic, earlier });
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
    trial: (round, findings) => {
      const trialDir = resolve(roundDir(round), "trial");
      mkdirSync(trialDir, { recursive: true });
      return trial({ canvas, boardPath: reviewed(round), outDir: trialDir, findings });
    },
    revise: pass && (async (round, findings, notes) => {
      const objects = (canvas.toolkit.openCanvasFile(boardPath).persisted as { objects: Array<{ id: string; type: string }> }).objects;
      const sections = new Set(objects.filter((object) => object.type === "section").map((object) => object.id));
      const revise = await pass(reviseMessage(board, findings, { ...notes, sections }), resolve(roundDir(round), "revise-transcript.jsonl"));
      passed("revise", round, revise.run);
      return revise;
    }),
    reask: pass && (async (round, ids) => {
      const reask = await pass([reaskPrompt(ids)], resolve(roundDir(round), "revise-reask-transcript.jsonl"));
      passed(`asked again for ${ids.join(", ")} after revise`, round, reask.run);
      return reask;
    }),
    restore: drawer && ((round) => copyFileSync(reviewed(round), boardPath)),
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
    + `${record.unanswered.length ? ` · no answer: ${record.unanswered.join(", ")}` : ""}`
    + `${record.kept ? ` · kept round ${record.kept.round}${record.kept.restored ? " (restored)" : ""}` : ""}`
    + ` · ${Math.round(record.durationMs / 1000)} s${record.error ? ` · ${record.error}` : ""}`;
}

/**
 * `climb critic --board <path> --out <dir> [--critic-count n] [--revise on|off]
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
