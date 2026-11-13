/**
 * The critic loop: review, revise, review again, as the Sol loop runs a code
 * review. Ford: "if there were failures in the previous run, the viewers have
 * to, like, come back. And this is done, like, a programmatic way where it's,
 * like, when the agent says it's done with the edits, it then does the review
 * process automatically. And this goes until It ends And, like, I'm
 * definitely thinking we, like, max out at 20".
 *
 * A round is one review (critic.ts): the lints canvas_check runs, plus the
 * reviewers. Each finding is a blocker, a should or a nit, and keeps one id
 * (F1, F2, ...) for the whole loop. A reviewer's finding says what is wrong
 * and marks where. The drawer gets the list with one highlight image a
 * reviewer (highlights.ts), revises in its own session, and answers each
 * finding: fixed, disagree or declined. Ford: "It goes through and either
 * you know, fixes them or rejects them or whatever its process is."
 *
 * Ford: "I see that there's these answers lost. We need to make sure that
 * doesn't happen." The loop checks that every id it sent has an answer, and
 * asks once more in the same session for the ones that have none. An id with
 * no answer after that goes into the next review and the next revise pass,
 * whatever that review finds.
 *
 * A finding the drawer turned down goes to the next round's reviewers with
 * its reason. A fault turned down twice is settled: the loop sends it no
 * more. A lint turned down with a reason is not sent again while the items
 * it names stay as they are.
 *
 * Ford: "this is done, like, a programmatic way". The runner measures the
 * plan of the board itself (space.ts): the empty space, each gap and each band
 * between sections against the gap rule, each wire through a section that
 * holds neither of its ends, and each far wire. A measure that fails is a
 * computed finding. It stays, and counts in the score, until the measure
 * passes. The drawer gets it 3 times at most (MEASURED_SENDS), and the loop
 * lists it after that. Before round 1, the drawer gets one rethink turn on the
 * same measures (rethink.ts).
 *
 * A layout finding is one that a section move fixes (isLayout). A decline
 * closes it only when earned (declineEarned): the revise pass moved a section
 * it is about, or the answer names the section move tried and what it
 * measured. Any other decline brings it back the next round under its id,
 * with one line of facts, MEASURED_SENDS sends at most.
 *
 * The review starts by code each time a revise pass ends. The loop stops at
 * the first round where every reviewer answered, none found a blocker or a
 * should, and no id is without an answer, or at round 20 (`--critic-rounds`).
 * The last round only reviews: nothing revises after it, so every board the
 * loop leaves has a score, and the loop keeps the board that scored best
 * (bestRound). When that is an earlier round, the fixes of the later revise
 * passes are lost: the drawer gets them once more in one last turn, and only
 * the lints and the computed checks run after it (lostFixes, LastTurn).
 *
 * `climb draw --critic on` runs the loop after the drawer's first pass
 * (draw.ts). `climb critic --board <path> --out <dir>` runs one review of a
 * frozen board, and with `--revise on` the whole loop on a copy of it, with a
 * new drawer session that stands in for the one that drew the board.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

import {
  CRITIC_FLAGS, SEVERITIES, checkBoard, critiqueBoard, critiqueSummary, loadReviewCanvas, parseCritic,
  type CriticOptions, type CritiqueRecord, type EarlierFinding, type Effort, type MergedFinding, type ReviewCanvas, type ReviewLint, type Severity,
} from "./critic.ts";
import { drawerFlags, drawerSession, type DrawerPart, type DrawerRun } from "./drawer.ts";
import { renderHighlights, type HighlightImage } from "./highlights.ts";
import { parseFlags } from "./paths.ts";
import { renderBoardPng, type WorldRect } from "./render.ts";
import { rethinkAnswers, rethinkMessage, rethinkReask, rethinkRecord, sectionMoves, unanswered as rethinkUnanswered, type RethinkRecord, type SectionMove } from "./rethink.ts";
import { REVIEWER_KINDS, SPACE_UNIT, short, type Board, type Mark, type ReviewerKind } from "./review-inputs.ts";
import { gapRule, sameBlock, type ComputedFault, type LayoutFacts } from "./space.ts";

export const VERDICTS = ["fixed", "disagree", "declined"] as const;
export type Verdict = (typeof VERDICTS)[number];
/** The drawer's answer to one finding. */
export interface Answer { verdict: Verdict; reason: string }

export interface LoopFinding {
  /** F1, F2, ...: one id for the whole loop. */
  id: string;
  /** check: a canvas_check lint. reviewer: one of the 6 kinds of reviewer. computed: a measure of the runner that fails (space.ts). */
  source: "check" | "reviewer" | "computed";
  severity: Severity;
  /** The lint's rule, the reviewer's finding kind, or `space` or `wire` for a computed finding (space.ts ComputedFault). */
  kind: string;
  ids: string[];
  labels: string[];
  /** What is wrong. A reviewer never says how to fix it. */
  problem: string;
  /** A lint's own advice, as canvas_check prints it. "" for a reviewer's finding. */
  suggestion: string;
  /** The units (space, wires, choices, a section id, gap-<n>, loose) whose reviewers reported it. A computed finding is in `space`. */
  regions: string[];
  /** Each of those reviewers' highlights of the fault. A lint has none. */
  marks: Array<{ unit: string; marks: Mark[] }>;
  /** A lint: the state of the items it names when the round reviewed them (critic.ts ReviewLint). A computed finding: its key (space.ts ComputedFault). "" for a reviewer's finding. */
  state: string;
  /** An empty block's or a band's place in its frame or section (space.ts ComputedFault). */
  block?: WorldRect;
  /** The earlier fix this finding may undo, in one line (historyOf). The drawer reads it under the finding. */
  history?: string;
  /** True for a layout finding (isLayout): a decline closes it only when earned. */
  layout?: true;
  /** The fault as it stands now, in one line, on a layout finding that came back after a decline that closed nothing. The drawer reads it under the finding. */
  facts?: string;
  /**
   * The drawer's answer and the round whose revise pass gave it, or null while
   * it has given none: in its round's revise pass, the re-ask, or a later round's pass.
   * `earned` is set when it turned a layout finding down: whether that closes it (declineEarned).
   */
  answer: (Answer & { round: number; earned?: boolean }) | null;
}

/** A fault a round found and did not send the drawer. */
export interface Withheld {
  /** A lint's or a computed finding's id from the round that sent it, or null for a reviewer's finding, which never got one. */
  id: string | null;
  source: LoopFinding["source"];
  severity: Severity;
  kind: string;
  ids: string[];
  problem: string;
  /**
   * held: a lint the drawer turned down with a reason, on items that have not
   * changed since. settled: turned down twice, or a computed wire finding
   * closed by an earned decline. stuck: a computed finding the drawer got
   * MEASURED_SENDS times, and the measure still fails, or a reviewer's layout
   * finding that came back that many times.
   */
  why: "held" | "settled" | "stuck";
  /** stuck: the drawer's last answer to it, or null when it gave none. */
  answer?: Answer | null;
  /** A stuck empty block's place this round (LoopFinding `block`). */
  block?: WorldRect;
}

/** What a revise pass carries besides its round's findings. */
export interface ReviseNotes {
  /** Findings of earlier rounds the drawer has not answered. This pass asks for their answers again. */
  unanswered: LoopFinding[];
}

/** One revise pass, and what the answer check found after it. */
export interface ReviseRecord extends DrawerRun {
  /** How many of the round's findings the drawer answered, the re-ask's answers among them. */
  answered: number;
  /** The highlight images the drawer got with the findings. */
  images: number;
  /** The pass that asked again for the ids the reply left out, or null when there was none: the reply answered every id, or the revise pass failed. */
  reask: (DrawerRun & { ids: string[] }) | null;
  /** The ids this pass sent that still have no answer, earlier rounds' among them. */
  unanswered: string[];
  /** The sections the pass moved as a whole (rethink.ts sectionMoves). */
  moved: SectionMove[];
}

/** What one review found (critic.ts), as the loop reads it. */
export interface Review {
  reviewMs: number;
  renderMs: number;
  /** The reasoning effort of its reviewers. */
  effort: Effort;
  /** How many reviewers of each kind ran. A kind with nothing to review on the board has none. */
  reviewers: Record<ReviewerKind, number>;
  regions: number;
  /** Reviewers that gave no answer. */
  unparsed: number;
  lints: ReviewLint[];
  findings: MergedFinding[];
  /** The measures of the board that fail (space.ts). */
  computed: ComputedFault[];
  /** What the decline rule reads of the board (space.ts LayoutFacts). */
  layout: LayoutFacts;
}

export interface RoundRecord {
  round: number;
  /** The loop's last review: the round the budget ends on, or the round after a revise pass that failed. Nothing revises after it. */
  check: boolean;
  /** What keep-best compares (roundFindings). Lower is better. */
  score: number;
  /** The part of the score keep-best leaves out while this round is the last: the lint warnings new in it. */
  grace: number;
  /** Wall clock of the review: lints, renders, reviewers and the merge. */
  reviewMs: number;
  renderMs: number;
  effort: Effort;
  reviewers: Record<ReviewerKind, number>;
  regions: number;
  unparsed: number;
  /** The findings this round sent the drawer, most severe first, each with the drawer's answer once it revised. */
  findings: LoopFinding[];
  /** The faults this round found and did not send. */
  withheld: Withheld[];
  /** The drawer's revise pass, or null when the round had none. */
  revise: ReviseRecord | null;
}

/** The round whose board the loop left in the board file. */
export interface Kept {
  round: number;
  /** True when that round is not the last: the loop put its snapshot back over the board file. */
  restored: boolean;
  reason: string;
  /** On a restore: the ids of the findings whose fixes it lost (lostFixes). */
  lost?: string[];
}

/** The one revise turn after a restore, for the fixes the restore lost. No reviewer runs after it. */
export interface LastTurn extends DrawerRun {
  /** The round whose board it revised. */
  round: number;
  /** The ids it sent, and the drawer's answer to each one it answered. */
  sent: string[];
  answers: Record<string, Answer>;
  moved: SectionMove[];
  /** What the lints and the computed checks weigh on the kept board and on the board the turn left: 3 a blocker, 1 a should. */
  checks: { before: number; after: number };
  /** True when the turn failed or left the checks worse: the loop put the kept board back once more. */
  undone: boolean;
}

export interface LoopRecord {
  /** The most review rounds. The last one only reviews. */
  budget: number;
  /** The reasoning effort of the reviewers, or null when no review ran. */
  effort: Effort | null;
  /** The drawer's rethink turn before round 1 (rethink.ts), or null when the loop had none. */
  rethink: RethinkRecord | null;
  rounds: RoundRecord[];
  /**
   * clean: in the last round every reviewer answered, none found a blocker
   * or a should, and every finding the drawer got has its answer. stuck: as
   * clean, but a computed finding the drawer got MEASURED_SENDS times is
   * still on the board (the last round's `withheld` lists it). budget:
   * the rounds ran out. incomplete: the rounds ran out and `unanswered` is
   * not empty. time: the loop's time ran out (`--loop-timeout-min`).
   * rate-limited: a revise pass hit a rate limit on each of its tries, and a
   * last round reviewed what it left. review-only: no drawer to revise.
   * failed: a step broke (error).
   */
  stop: "clean" | "stuck" | "incomplete" | "budget" | "time" | "rate-limited" | "review-only" | "failed";
  error: string | null;
  /** The ids the drawer got and never answered. */
  unanswered: string[];
  /** Null when the loop could not choose: no drawer, or no review of the last board. */
  kept: Kept | null;
  /** Null when the loop restored no round, the restore lost no fix a last turn can make, or the loop had no time or no working drawer left. */
  last: LastTurn | null;
  durationMs: number;
}

/** A loop that broke before its first review. */
export const failedLoop = (budget: number, error: string): LoopRecord =>
  ({ budget, effort: null, rethink: null, rounds: [], stop: "failed", error, unanswered: [], kept: null, last: null, durationMs: 0 });

const LINT_SEVERITY: Record<string, Severity> = { error: "blocker", warning: "should", note: "nit" };
const rank = (finding: { severity: Severity }) => SEVERITIES.indexOf(finding.severity);
/** A finding the loop does not stop on. */
const isOpen = (finding: { severity: Severity }) => finding.severity !== "nit";
const SCORE_WEIGHT: Record<Severity, number> = { blocker: 3, should: 1, nit: 0 };
/** A fault the drawer turned down this many times is settled. */
const SETTLED_AFTER = 2;
/** A computed finding goes to the drawer this many times. After that the loop lists it and sends it no more. */
export const MEASURED_SENDS = 3;
/** The finding kinds a drawer fixes by moving or resizing things. */
const LAYOUT_KINDS: ReadonlySet<string> = new Set(["placement", "spacing", "space", "wire"]);
/** The kinds of a reviewer's finding that a section move can fix. */
const MOVE_KINDS: ReadonlySet<string> = new Set(["placement", "spacing", "routing"]);

const normal = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
/** disagree and declined both turn a finding down. */
const turnedDown = (finding: LoopFinding) => finding.answer !== null && finding.answer.verdict !== "fixed";
const withReason = (finding: LoopFinding) => turnedDown(finding) && finding.answer!.reason.trim().length > 0;
/**
 * What makes two reviewer findings of different rounds one fault: the kind
 * and the same items, by id, or by label when it names no id. The words of
 * the problem differ from round to round. Null for a finding that names
 * nothing: it matches no other.
 */
function faultKey(finding: Pick<LoopFinding, "kind" | "ids" | "labels">): string | null {
  if (finding.ids.length > 0) return JSON.stringify([finding.kind, "ids", [...new Set(finding.ids)].sort()]);
  if (finding.labels.length > 0) return JSON.stringify([finding.kind, "labels", [...new Set(finding.labels.map(normal))].sort()]);
  return null;
}

/**
 * A layout finding: where a section sits is the fault, so a section move is
 * the fix. The runner's wire findings (a narrow band, a wire through a
 * section, a far wire), the space reviewer's placement, spacing and routing
 * findings, and any reviewer's finding of those kinds on sections alone (a
 * store before the stages that feed it) or on a wire between 2 sections that
 * crosses a wire, runs through a section or is long (space.ts LayoutFacts).
 * An empty block is not one: no decline closes it.
 */
export function isLayout(finding: Pick<LoopFinding, "source" | "kind" | "ids" | "regions">, layout: LayoutFacts | undefined): boolean {
  if (finding.source === "computed") return finding.kind === "wire";
  if (finding.source !== "reviewer" || !MOVE_KINDS.has(finding.kind)) return false;
  return finding.regions.includes(SPACE_UNIT) || finding.ids.some((id) => layout?.wires[id] !== undefined)
    || (finding.ids.length > 0 && finding.ids.every((id) => layout?.sections[id] !== undefined));
}

/** A move the answer says it made or tried. "cannot move", "was not moved", "a swap would" and "tried a route" say no move. */
const MOVE_TRIED = /(?<!(?:\b(?:not|never|cannot|without|no)|n['’]t)\s+(?:\w+\s+)?)\b(moved|swapped|shifted|reordered|rearranged|relocated|placed|put|tried\s+(?:\w+\s+){0,2}(?:mov|swap|shift|reorder|rearrang|relocat|plac|put)\w*)\b/gi;
/** The words between a move and the section it moves: "moved the section Store", "tried a swap of Store and Engine". */
const MOVE_FILLER = /^(?:(?:the|a|both|whole|section|sections|of) )*/;
const RESULT_WORDS = /\d\s*(px|%|wires?\b|crossings?\b|bends?\b)/i;

/**
 * Whether a decline of a layout finding closes it. Round 5 cycle 2 closed
 * crossings and long wires on "forced" and "must cross once" with no section
 * moved (h1 F146, h4 F34, 06 F13), and the section order stayed wrong. A
 * decline is earned when the revise pass moved a section the finding is
 * about (`moved`: the ids), or when its reason says a move it made or tried
 * of a section it names, and what it measured. The section is what the move
 * moves: "moved Store under Intake", "Store was moved". A reason why no move
 * was tried is not one, and neither is a route it tried or a move of a label
 * near a section. A finding that names no item of a section is about every
 * section.
 */
export function declineEarned(finding: Pick<LoopFinding, "ids">, reason: string, moved: string[], layout: LayoutFacts | undefined): boolean {
  const about = new Set(finding.ids.flatMap((id) => layout?.holders[id] ?? []));
  if (moved.some((id) => about.size === 0 || about.has(id))) return true;
  const sections = Object.entries(layout?.sections ?? {}).flat().map(normal).filter((name) => name.length > 2);
  const moves = (sentence: string) => [...sentence.matchAll(MOVE_TRIED)].some((move) => {
    const after = `${normal(sentence.slice(move.index + move[0].length)).replace(MOVE_FILLER, "")} `;
    const before = normal(sentence.slice(0, move.index)).replace(/ (?:was|were|is|got)$/, "");
    // "Store's label" is a label, and "store s" is how it reads here.
    return sections.some((name) => (after.startsWith(`${name} `) && !after.startsWith(`${name} s `)) || ` ${before}`.endsWith(` ${name}`));
  });
  return reason.split(/[.;\n]\s/).some(moves) && RESULT_WORDS.test(reason);
}

/** How many revise passes turned these findings down. 2 findings one pass declined are one decline. */
const declines = (findings: LoopFinding[]) => new Set(findings.filter(turnedDown).map((finding) => finding.answer!.round)).size;
/**
 * The findings of each reviewer fault the drawer turned down. A reviewer can
 * report 2 faults of one kind on the same items: they are one fault here.
 */
function declinedFaults(ledger: LoopFinding[]): Map<string, LoopFinding[]> {
  const faults = new Map<string, LoopFinding[]>();
  for (const finding of ledger) {
    // A decline that closed nothing is no decline here: the loop sends that finding again itself (returningOf).
    if (finding.source !== "reviewer" || !turnedDown(finding) || finding.answer!.earned === false) continue;
    const fault = faultKey(finding) ?? finding.id;
    faults.set(fault, [...(faults.get(fault) ?? []), finding]);
  }
  return faults;
}

/**
 * The reviewers' layout findings whose last decline closed nothing: each as
 * the drawer last got it. `previous` is the round before: it sent the finding,
 * or listed it as stuck.
 */
function returningOf(ledger: LoopFinding[], previous: Pick<RoundRecord, "findings" | "withheld"> | null): LoopFinding[] {
  const ids = new Set([...(previous?.findings ?? []), ...(previous?.withheld ?? [])].flatMap((finding) => finding.source === "reviewer" && finding.id ? [finding.id] : []));
  return [...ids].flatMap((id) => {
    const last = ledger.findLast((finding) => finding.id === id);
    return last?.answer?.earned === false ? [last] : [];
  });
}

/** The line of facts under a layout finding that came back. */
const returnLine = (last: LoopFinding, facts: string) => `your decline in round ${last.answer!.round} moved no section of this finding, and named no section move with what it measured. ${sentence(facts)}`;

/**
 * The reversal guard. A layout finding on the items of a layout finding the
 * drawer fixed in an earlier round may ask to undo that fix: round 5 moved a
 * section down for one finding and back for the next (board 14). The finding
 * is sent with that fix in one line, so the drawer sees both. "The same
 * items": one finding names every id of the other. Null when no fix matches.
 */
function historyOf(ledger: LoopFinding[], fresh: Pick<LoopFinding, "kind" | "ids" | "state" | "block">): string | null {
  if (!LAYOUT_KINDS.has(fresh.kind) || fresh.ids.length === 0) return null;
  const within = (inner: string[], outer: string[]) => inner.every((id) => outer.includes(id));
  const cause = ledger.findLast((old) => old.source !== "check" && LAYOUT_KINDS.has(old.kind) && old.answer?.verdict === "fixed" && old.ids.length > 0
    // The same measure, passed and back on the board, did not cause itself.
    && !(fresh.state && old.state === fresh.state && (!fresh.block || sameBlock(old.block!, fresh.block)))
    && (within(old.ids, fresh.ids) || within(fresh.ids, old.ids)));
  if (!cause) return null;
  return `in round ${cause.answer!.round} you fixed ${cause.id} on ${cause.ids.join(", ")}: ${JSON.stringify(short(cause.problem, 160))}.`
    + ` This finding is on the same items, so that fix may have caused it. Fix it in a way that keeps ${cause.id} fixed.`;
}

/**
 * One round's findings: the lints, the runner's computed findings, then the
 * reviewers', most severe first. `ledger` holds every earlier round's
 * findings with the drawer's answers.
 *
 * A lint an earlier round raised keeps its id, and is sent again while it is
 * on the board, with 2 exceptions. The drawer turned it down with a reason
 * and the items it names have not changed since: it is held. The drawer
 * turned it down with a reason twice: it is settled. Round 4 spent rounds on
 * the same lints, declined each round (h1: 9 of them, to round 11).
 *
 * A computed finding keeps its id while its measure fails, from round to
 * round: `previous` is the round before. A measure that passes closes it, and
 * the same fault back on the board is a new finding. No answer settles
 * or holds a `space` one: round 5 closed real faults on a decline (h1: 8 wires
 * in a 280 px gap that the rule gives 340). An earned decline settles a `wire`
 * one (declineEarned). After a decline that closed nothing it comes back with
 * its line of facts. It is sent MEASURED_SENDS times, so it cannot run the
 * loop to its last round alone. After that it is stuck: listed in `withheld`
 * with the drawer's last answer, and not sent.
 *
 * A reviewer's finding is new each round. One that names the kind and the
 * items of a fault the drawer turned down twice is settled, and not sent.
 * A layout finding the drawer declined with no section move is the exception:
 * it comes back under its id with a line of facts, while its items are on the
 * board and it still is a layout finding there, and a new finding on the same
 * items is dropped. After MEASURED_SENDS sends it is stuck.
 *
 * The score counts what the board has, sent or not: 3 for each blocker and 1
 * for each should, over every lint on the board, every computed finding, the
 * reviewers' findings sent and the ones that are stuck. `grace` is the part of it from lint warnings on items no earlier lint
 * of its rule named, in a round after the first. A revise pass that moves
 * whole sections can leave such warnings for one round, and keep-best must
 * not go back to the old board for that alone: it takes the grace off the
 * last round's score, and off no earlier round's (bestRound).
 */
export function roundFindings(
  ledger: LoopFinding[], review: Pick<Review, "lints" | "findings"> & Partial<Pick<Review, "computed" | "layout">>, round = 1,
  previous: Pick<RoundRecord, "findings" | "withheld"> | null = null,
): { findings: LoopFinding[]; withheld: Withheld[]; score: number; grace: number } {
  const key = (finding: Pick<LoopFinding, "kind" | "ids" | "problem">) => JSON.stringify([finding.kind, finding.ids, finding.problem]);
  const items = (finding: Pick<LoopFinding, "kind" | "ids">) => JSON.stringify([finding.kind, [...finding.ids].sort()]);
  const checks = ledger.filter((finding) => finding.source === "check");
  const knownItems = new Set(checks.map(items));
  const declined = declinedFaults(ledger);
  let next = 1 + Math.max(0, ...ledger.map((finding) => Number(finding.id.slice(1))));
  let [score, grace] = [0, 0];
  const findings: LoopFinding[] = [];
  const withheld: Withheld[] = [];
  for (const lint of review.lints) {
    const fresh: Omit<LoopFinding, "id"> = {
      source: "check", severity: LINT_SEVERITY[lint.severity] ?? "should", kind: lint.rule,
      ids: lint.at, labels: [], problem: lint.message, suggestion: lint.suggestion ?? "", regions: [], marks: [], state: lint.state, answer: null,
    };
    const before = checks.filter((finding) => key(finding) === key(fresh));
    const last = before.at(-1);
    score += SCORE_WEIGHT[fresh.severity];
    if (round > 1 && fresh.severity === "should" && !knownItems.has(items(fresh))) grace += SCORE_WEIGHT[fresh.severity];
    const why = declines(before.filter(withReason)) >= SETTLED_AFTER ? "settled" : last && withReason(last) && last.state === lint.state ? "held" : null;
    if (why && last) withheld.push({ id: last.id, source: "check", severity: fresh.severity, kind: fresh.kind, ids: fresh.ids, problem: fresh.problem, why });
    else findings.push({ id: last?.id ?? `F${next++}`, ...fresh });
  }
  const history = (fresh: Omit<LoopFinding, "id">) => {
    const line = historyOf(ledger, fresh);
    return line ? { history: line } : {};
  };
  /** The ids of this round's empty blocks: 2 blocks of one frame or section never share one. */
  const placed = new Set<string>();
  /** Whether the round before had this finding on the board, sent or stuck. */
  const onBoard = (id: string) => !previous || [...previous.findings, ...previous.withheld].some((finding) => finding.id === id);
  for (const fault of review.computed ?? []) {
    const fresh: Omit<LoopFinding, "id"> = {
      source: "computed", severity: "should", kind: fault.kind,
      ids: fault.ids, labels: [], problem: fault.problem, suggestion: "", regions: [SPACE_UNIT], marks: [{ unit: SPACE_UNIT, marks: fault.marks }], state: fault.key,
      ...(fault.block ? { block: fault.block } : {}), ...(fault.kind === "wire" ? { layout: true } : {}), answer: null,
    };
    // A measure that passed closed its finding: the same fault back on the board is a new one, with its history.
    const measured = ledger.filter((finding) => finding.source === "computed" && finding.state === fault.key && onBoard(finding.id));
    // An empty block is the fault of the earlier block at its place, not of the block that had its rank.
    // The place of each is the latest: the last one sent, or the one the round before held as stuck.
    const places = new Map(measured.map((finding) => [finding.id, finding.block]));
    for (const stuck of previous?.withheld ?? []) if (stuck.id && stuck.block && places.has(stuck.id)) places.set(stuck.id, stuck.block);
    const same = fault.block && [...places].find(([id, block]) => !placed.has(id) && block && sameBlock(block, fault.block!))?.[0];
    const before = fault.block ? measured.filter((finding) => finding.id === same) : measured;
    const last = before.at(-1);
    if (last) placed.add(last.id);
    score += SCORE_WEIGHT[fresh.severity];
    const earned = last?.answer?.earned;
    if (last && (earned || before.length >= MEASURED_SENDS)) {
      const answer = last.answer && { verdict: last.answer.verdict, reason: last.answer.reason };
      withheld.push({
        id: last.id, source: "computed", severity: fresh.severity, kind: fresh.kind, ids: fresh.ids, problem: fresh.problem, why: earned ? "settled" : "stuck", answer,
        ...(fault.block ? { block: fault.block } : {}),
      });
    // A finding that keeps its id was on the board before the fix of any other: it is no reversal.
    } else findings.push(last ? { id: last.id, ...fresh, ...(earned === false && fault.facts ? { facts: returnLine(last, fault.facts) } : {}) } : { id: `F${next++}`, ...fresh, ...history(fresh) });
  }
  const { layout } = review;
  /** The faults that came back, by fault key: a reviewer's new finding of one is the same fault. */
  const back = new Set<string>();
  for (const last of returningOf(ledger, previous)) {
    // The fault left with its items, or with the crossing, the run through a section or the length that made its wire a layout fault.
    if (layout && !(last.ids.every((id) => layout.holders[id] !== undefined) && isLayout(last, layout))) continue;
    const fault = faultKey(last);
    if (fault) back.add(fault);
    score += SCORE_WEIGHT[last.severity];
    if (ledger.filter((finding) => finding.id === last.id).length >= MEASURED_SENDS) {
      withheld.push({ id: last.id, source: "reviewer", severity: last.severity, kind: last.kind, ids: last.ids, problem: last.problem, why: "stuck", answer: { verdict: last.answer!.verdict, reason: last.answer!.reason } });
      continue;
    }
    const about = new Set(last.ids.flatMap((id) => layout?.holders[id] ?? []));
    // Its own wire's line, or the line of a wire of one of its sections.
    const wire = last.ids.find((id) => layout?.wires[id] !== undefined) ?? Object.keys(layout?.wires ?? {}).find((id) => layout!.holders[id]?.some((section) => about.has(section)));
    const { history: _, facts: __, ...same } = last;
    findings.push({ ...same, facts: returnLine(last, wire ? layout!.wires[wire]! : "No wire of its sections crosses a wire, runs through a section or is long now"), answer: null });
  }
  for (const finding of review.findings) {
    const fresh: Omit<LoopFinding, "id"> = {
      source: "reviewer", severity: finding.severity, kind: finding.kind,
      ids: finding.ids, labels: finding.labels, problem: finding.problem, suggestion: "", regions: finding.regions, marks: finding.marks, state: "", answer: null,
    };
    if (isLayout(fresh, layout)) fresh.layout = true;
    const fault = faultKey(fresh);
    if (fault && back.has(fault)) continue;
    if (fault && declines(declined.get(fault) ?? []) >= SETTLED_AFTER) {
      withheld.push({ id: null, source: "reviewer", severity: fresh.severity, kind: fresh.kind, ids: fresh.ids, problem: fresh.problem, why: "settled" });
      continue;
    }
    score += SCORE_WEIGHT[fresh.severity];
    findings.push({ id: `F${next++}`, ...fresh, ...history(fresh) });
  }
  // The sort is stable: a lint stays ahead of the computed findings of its severity, and those ahead of the reviewers'.
  return { findings: findings.sort((a, b) => rank(a) - rank(b)), withheld, score, grace };
}

const names = (finding: Pick<LoopFinding, "ids" | "labels">) => [...finding.ids, ...finding.labels.map((label) => JSON.stringify(label))].join(", ");
const sentence = (text: string) => /[.!?]$/.test(text) ? text : `${text}.`;

const tagOf = (finding: Pick<LoopFinding, "source" | "kind">) =>
  finding.source === "check" ? `check ${finding.kind}` : finding.source === "computed" ? `measured ${finding.kind}` : finding.kind;

/** One finding as the drawer reads it. A lint's message and a computed finding's name their items themselves. A lint keeps canvas_check's advice. */
export function findingLine(finding: LoopFinding): string {
  const tag = tagOf(finding);
  const subject = finding.source === "reviewer" && names(finding) ? `${names(finding)}: ` : "";
  return `${finding.id} [${finding.severity}, ${tag}] ${subject}${sentence(finding.problem)}${finding.suggestion ? ` Fix: ${finding.suggestion}` : ""}`;
}

/**
 * The reviewers' findings the drawer turned down, as the next round's
 * reviewers read them: a fault as the last revise pass that declined it read
 * it, with the drawer's reason. A
 * reviewer raises such a fault again only when the reason is wrong on the
 * board as it is then. A fault turned down twice is settled.
 */
export function declinedFindings(ledger: LoopFinding[], previous: Pick<RoundRecord, "findings" | "withheld"> | null = null): EarlierFinding[] {
  const returned = returningOf(ledger, previous).map((last): EarlierFinding => ({
    ids: last.ids, regions: last.regions, line: `[${last.kind}] ${names(last) ? `${names(last)}: ` : ""}${sentence(last.problem)}`, settled: false, returned: true,
  }));
  return [...returned, ...[...declinedFaults(ledger).values()].flatMap((same) => {
    const lastPass = Math.max(...same.map((finding) => finding.answer!.round));
    const regions = [...new Set(same.flatMap((finding) => finding.regions))];
    // What the last pass turned down: 2 lines when it declined 2 faults of one kind on the same items.
    return same.filter((finding) => finding.answer!.round === lastPass).map((last) => {
      const { verdict, reason } = last.answer!;
      return {
        ids: last.ids,
        regions,
        line: `[${last.kind}] ${names(last) ? `${names(last)}: ` : ""}${sentence(last.problem)} The drawer ${verdict === "disagree" ? "disagreed" : "declined"}: ${reason.trim() || "it gave no reason"}`,
        settled: declines(same) >= SETTLED_AFTER,
      };
    });
  })];
}

const ANSWER_LINES = ["<id> fixed", "<id> disagree: <why the finding is wrong>", "<id> declined: <why you left it>"];
/** How a decline of a layout finding must read to close it (declineEarned). */
const MOVE_ANSWER = "<id> declined: moved <section> <where>, measured <the wire length, the crossings or the gap in px after the move>";

/**
 * The drawer's revise turn, in its own session, after a review: the text,
 * then each highlight image under its number, its reviewer and its findings.
 */
export function reviseMessage(board: string, findings: LoopFinding[], notes: Partial<ReviseNotes> & { images?: HighlightImage[] } = {}): DrawerPart[] {
  const { unanswered = [], images = [] } = notes;
  const space = (finding: LoopFinding) => finding.regions.includes(SPACE_UNIT);
  // The sort is stable: each group stays most severe first.
  const ordered = [...findings].sort((a, b) => Number(space(b)) - Number(space(a)));
  const blocks = ordered.flatMap((finding) => {
    if (finding.source === "check") return [findingLine(finding)];
    const shown = images.flatMap((image, index) => image.findings.includes(finding.id) ? [`image ${index + 1}`] : []);
    return [
      findingLine(finding),
      `  ${finding.source === "computed" ? "measured by the runner on the board file" : `from ${finding.regions.join(", ")}`}${finding.layout ? " · layout finding" : ""}${shown.length ? ` · ${shown.join(", ")}` : ""}`,
      ...(finding.history ? [`  history: ${finding.history}`] : []),
      ...(finding.facts ? [`  facts: ${finding.facts}`] : []),
    ];
  });
  const text = [
    "Reviewers looked at your board: the canvas_check lints, and reviewers that each read one part: a section, the gaps between sections at full size, the wires between sections,"
    + " where the sections sit (`space`), the choices of colour, shape and icon against the brief, and the items in no section. Their findings are below, most severe first.",
    "blocker: a reader misreads the board, or something is broken, hidden or cut off. should: clearly off to a careful designer. nit: polish.",
    "A reviewer's finding says what is wrong and where. It does not say how to fix it: the fix is your decision. Look at the board, choose the tool calls, and check what each one did.",
    "Fix each blocker and each should you agree with, using the canvas tools. Fix a nit only when one call does it.",
    "Decline a finding that is wrong, or that you cannot fix without breaking something else, and give the reason. The reviewers read your reason in the next round.",
    "A fix must not resize a section past its content, merge nodes, or grow an empty block. After you move a section, close the space it left.",
    ...(ordered.some((finding) => finding.source === "computed") ? [
      "A `measured` finding is a number the runner computed on the board file: an empty block, a section that is mostly empty, a gap or a band between sections off its gap rule number,"
      + " a wire through a section that holds neither of its ends, a far wire. A decline does not close a `measured space` finding: it comes back until the number passes.",
    ] : []),
    ...(ordered.some((finding) => finding.layout) ? [
      "A `layout finding` is a fault of where the sections sit: a crossing or a long wire between sections, a wire through a section, a band too narrow for its wires."
      + " Move a section before you route or decline: swap 2 neighbours, or change the row or the column of one."
      + " A decline closes such a finding only when this turn moved a whole section it is about, or when your answer names the section move you tried and what it measured:",
      MOVE_ANSWER,
      "Any other decline brings the finding back in the next round, with its facts.",
    ] : []),
    ...(ordered.some((finding) => finding.facts) ? [
      "A `facts` line under a finding says why it is back, and how the fault stands now: the wire's length, the sections between its ends, and a swap of 2 sections that would shorten it when the runner found one.",
    ] : []),
    ...(ordered.some(space) ? [
      "The `measured` findings and the findings from the `space` reviewer come first. They are fixed by moving or resizing whole sections: `arrange`, `move`, `place_section`, `fit_section`."
      + " That is expected, and nothing in this loop counts against it. Settle those first: a section takes everything it holds with it."
      + " Then route the wires again, and fix the other findings on the board as it is then.",
    ] : []),
    ...(ordered.some((finding) => finding.history) ? [
      "A `history` line under a finding names a fix of an earlier round on the same items. Do not swap one fault for the other: find the layout that clears both.",
    ] : []),
    ...(images.length ? [
      "The images after this text show the findings on the board as it is now: one image a reviewer, each fault marked in red and tagged with its finding's id. The line under a finding names its images.",
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
  return [text, ...images.flatMap((image, index) => [`Image ${index + 1} · ${image.unit} · ${image.findings.join(", ")}`, { image: image.path }])];
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
 * the board as it stands: the lowest score (roundFindings), and on a tie the
 * later round. The last round's score is less its grace: the drawer had no
 * round to clear the lint warnings its last revise pass left. An earlier
 * round's score is whole: the warnings it left count against it.
 *
 * The score is a sample, not a measure. The reviewers differ from run to
 * run, so two reviews of one board can score a few points apart. A later
 * round also leaves out the settled faults, so a later board scores lower
 * than a fresh review would score it. An earlier round wins only against
 * that lean. A round that lost a
 * reviewer's answer undercounts. As an earlier round it cannot win. As the
 * last round it loses only to a full review that scored less than its
 * undercount.
 */
export function bestRound(rounds: RoundRecord[]): Kept | null {
  const last = rounds.at(-1);
  if (!last) return null;
  const full = (round: RoundRecord) => round.unparsed === 0;
  const orMore = full(last) ? "" : " or more";
  const points = (round: RoundRecord) => round === last ? round.score - round.grace : round.score;
  const lastScored = `scored ${points(last)}${last.grace ? ` (${last.score} less ${last.grace} for the lint warnings new in it)` : ""}`;
  const best = rounds.filter((round) => full(round) || round === last).reduce((low, round) => points(round) <= points(low) ? round : low);
  if (best !== last) return { round: best.round, restored: true, reason: `round ${best.round} scored ${best.score}, and the last board (round ${last.round}) ${lastScored}${orMore}` };
  const level = rounds.findLast((round) => round !== last && full(round) && round.score === points(last));
  let reason = `round ${last.round} is the last board and ${lastScored}, the best of the loop`;
  if (!full(last)) reason = `round ${last.round} is the last board. Its review lost ${last.unparsed} of ${last.regions} reviewers, so it ${lastScored} or more, and no full review scored less than ${points(last)}`;
  else if (level) reason = `round ${last.round} is the last board and ${lastScored}, level with round ${level.round}: a tie keeps the later board`;
  return { round: last.round, restored: false, reason };
}

/**
 * The loop itself. `review` is one review of the board as it stands, given
 * the findings the drawer turned down in the earlier rounds. `revise` hands
 * a round's findings to the drawer and returns its run, its closing reply,
 * and how many highlight images it got. `reask` asks the drawer once more, in
 * the session of that revise, for the ids its reply did not answer. `restore`
 * puts back the board a round reviewed. The loop calls it when an earlier
 * round's board scored better than the last one (bestRound). `timeUp` is
 * true once the loop may start no new revise pass.
 *
 * A round is clean when every reviewer answered and it has no blocker and no
 * should to send: a reviewer that timed out or failed did not approve, and
 * nits alone end the loop. Such a round that still holds a stuck computed
 * finding stops the loop as "stuck", not "clean". A clean round still goes to the drawer when a
 * finding of an earlier round has no answer.
 *
 * Round `budget` only reviews, and so does the round after a revise pass that
 * failed or that a rate limit stopped on each of its tries: it scores what
 * that pass left, and nothing revises it.
 */
export async function reviewLoop(options: {
  budget: number;
  /** The drawer's rethink turn, before round 1. */
  rethink?(): Promise<RethinkRecord>;
  review(round: number, earlier: EarlierFinding[]): Promise<Review>;
  revise?(round: number, findings: LoopFinding[], notes: ReviseNotes): Promise<{ run: DrawerRun; reply: string; images?: number; moved?: SectionMove[] }>;
  reask?(round: number, ids: string[]): Promise<{ run: DrawerRun; reply: string }>;
  restore?(round: number): void;
  /** One more revise turn on the restored board, for the fixes the restore lost, and what the code checks find on the board it leaves. */
  last?(kept: Kept, findings: LoopFinding[]): Promise<{ run: DrawerRun; reply: string; moved?: SectionMove[]; lints: ReviewLint[]; computed: ComputedFault[] }>;
  timeUp?(): boolean;
}): Promise<LoopRecord> {
  const started = Date.now();
  const rounds: RoundRecord[] = [];
  const ledger = () => rounds.flatMap((record) => record.findings);
  /** True while a drawer pass may have changed the board since its last review. */
  let unreviewed = false;
  let rethink: RethinkRecord | null = null;
  const loop = async (): Promise<Pick<LoopRecord, "stop" | "error">> => {
    const done = (stop: LoopRecord["stop"], error: string | null = null) => ({ stop, error });
    /** Why the last revise pass did not end. The next round is then the last. */
    let broken: { stop: "failed" | "rate-limited"; error: string } | null = null;
    try {
      if (options.rethink) {
        unreviewed = true;
        rethink = await options.rethink();
      }
      for (let round = 1; ; round += 1) {
        const asked = unansweredOf(rounds);
        const review = await options.review(round, declinedFindings(ledger(), rounds.at(-1)));
        const record: RoundRecord = {
          round, check: round >= options.budget || broken !== null, ...roundFindings(ledger(), review, round, rounds.at(-1)),
          reviewMs: review.reviewMs, renderMs: review.renderMs, effort: review.effort, reviewers: review.reviewers, regions: review.regions, unparsed: review.unparsed,
          revise: null,
        };
        const { findings } = record;
        rounds.push(record);
        // A finding that was stuck is not sent again, so the loop does not wait for its answer.
        const stuck = new Set(rounds.flatMap((each) => each.withheld).filter((fault) => fault.why === "stuck").map((fault) => fault.id));
        const carried = asked.filter((finding) => !stuck.has(finding.id));
        unreviewed = false;
        if (broken !== null) return done(broken.stop, broken.error);
        /** Nothing to send the drawer: only a reviewer that gave no answer keeps the loop going. */
        const idle = !findings.some(isOpen) && carried.length === 0;
        if (idle && review.unparsed === 0) return done(record.withheld.some((fault) => fault.why === "stuck") ? "stuck" : "clean");
        if (!options.revise) return done("review-only");
        if (record.check) return done(carried.length ? "incomplete" : "budget");
        if (options.timeUp?.()) {
          record.check = true;
          return done("time");
        }
        if (idle) continue;

        const notes: ReviseNotes = {
          // A lint that is still on the board is among this round's findings, under its old id.
          unanswered: [...new Map(carried.map((finding) => [finding.id, finding])).values()]
            .filter((finding) => !findings.some((now) => now.id === finding.id)),
        };
        unreviewed = true;
        const sent = [...findings, ...carried];
        const tally = () => ({ answered: findings.filter((finding) => finding.answer).length, unanswered: idsOf(sent.filter((finding) => !finding.answer)) });
        const { run, reply, images = 0, moved = [] } = await options.revise(round, findings, notes);
        const take = (reply: string) => {
          const answers = parseAnswers(reply);
          for (const finding of sent) {
            const answer = answers.get(finding.id);
            if (finding.answer || !answer) continue;
            // A decline of a layout finding closes it only when earned.
            const earned = finding.layout && answer.verdict !== "fixed" ? { earned: declineEarned(finding, answer.reason, moved.map((move) => move.id), review.layout) } : {};
            finding.answer = { ...answer, round, ...earned };
          }
        };
        take(reply);
        // The record stands before the second ask, so a second ask that throws does not lose the ids.
        const revise: ReviseRecord = record.revise = { ...run, ...tally(), images, reask: null, moved };
        if (revise.unanswered.length > 0 && run.exitCode === 0 && options.reask) {
          const ids = revise.unanswered;
          const second = await options.reask(round, ids);
          take(second.reply);
          Object.assign(revise, tally(), { reask: { ...second.run, ids } });
        }
        if (run.rateLimited) broken = { stop: "rate-limited", error: `round ${round}: the revise pass hit a rate limit on each of its ${run.tries} tries` };
        else if (run.exitCode !== 0) broken = { stop: "failed", error: `round ${round}: the revise pass ${run.timedOut ? "timed out" : `exited ${run.exitCode ?? run.signal}`}` };
      }
    } catch (error) {
      return done("failed", broken === null ? message(error) : `${broken.error}; then its last review failed: ${message(error)}`);
    }
  };
  const outcome = await loop();
  const kept = options.restore && !unreviewed ? bestRound(rounds) : null;
  let last: LastTurn | null = null;
  if (kept?.restored) {
    options.restore!(kept.round);
    const lost = lostFixes(rounds, kept.round);
    kept.lost = lost.map((finding) => finding.id);
    // A layout finding and a computed one need a section move, and no reviewer reads the board after this turn.
    const local = lost.filter((finding) => finding.source !== "computed" && !finding.layout);
    const working = outcome.stop !== "failed" && outcome.stop !== "rate-limited" && !options.timeUp?.();
    if (options.last && local.length > 0 && working) {
      const on = rounds.find((round) => round.round === kept.round)!;
      const before = [...on.findings, ...on.withheld].filter((finding) => finding.source !== "reviewer").reduce((sum, finding) => sum + SCORE_WEIGHT[finding.severity], 0);
      try {
        const { run, reply, moved = [], lints, computed } = await options.last(kept, local);
        const after = lints.reduce((sum, lint) => sum + SCORE_WEIGHT[LINT_SEVERITY[lint.severity] ?? "should"], 0) + computed.length * SCORE_WEIGHT.should;
        const answers = parseAnswers(reply);
        last = {
          ...run, round: kept.round, sent: local.map((finding) => finding.id), answers: Object.fromEntries(local.flatMap((finding) => answers.has(finding.id) ? [[finding.id, answers.get(finding.id)!]] : [])),
          moved, checks: { before, after }, undone: run.exitCode !== 0 || after > before,
        };
      } catch (error) {
        outcome.error = `${outcome.error ? `${outcome.error}; ` : ""}the last turn failed: ${message(error)}`;
        options.restore!(kept.round);
      }
      if (last?.undone) options.restore!(kept.round);
    }
  }
  return { budget: options.budget, effort: rounds[0]?.effort ?? null, rethink, rounds, ...outcome, unanswered: idsOf(unansweredOf(rounds)), kept, last, durationMs: Date.now() - started };
}

/**
 * The fixes a restore of round `kept` loses: the findings the drawer answered
 * `fixed` in that round's revise pass or a later one, each once. Round 5 cycle
 * 2 went back to round 10 on h4 and lost a later fix of a label chip. A lint
 * or a computed finding of a later round counts only when the kept round had
 * it under the same id. A reviewer's finding of a later round counts: no
 * reviewer read the kept board for it, the fault can be on that board, and the
 * last turn declines one that is not (lastMessage).
 */
export function lostFixes(rounds: RoundRecord[], kept: number): LoopFinding[] {
  const on = rounds.find((round) => round.round === kept);
  const had = new Set([...(on?.findings ?? []), ...(on?.withheld ?? [])].map((finding) => finding.id));
  const lost = new Map<string, LoopFinding>();
  for (const round of rounds) for (const finding of round.findings) {
    if (finding.answer?.verdict !== "fixed" || finding.answer.round < kept) continue;
    if (round.round > kept && finding.source !== "reviewer" && !had.has(finding.id)) continue;
    lost.set(finding.id, finding);
  }
  return [...lost.values()];
}

/** The drawer's last turn: the board is back at an earlier round, and these fixes of later turns are not on it. */
export function lastMessage(board: string, kept: Kept, findings: LoopFinding[]): string {
  return [
    `The review loop ended. It keeps the board that scored best, and that is the board of round ${kept.round}: ${sentence(kept.reason)}`,
    `The board file is that board again. The fixes you made after it are gone. The findings below are the ones you answered \`fixed\` from round ${kept.round} on.`,
    "Look at each one on the board as it is now. Make the fix again when it is local: a label chip, a port, a route, a colour, an icon, a text, one node.",
    "Do not move or resize a section in this turn: no reviewer reads the board after it. Decline a finding that needs that, and one that is not on this board.",
    `The canvas server restarted. Open the board again with canvas_open, canvas id "${board}", and read any guidance topic it asks for.`,
    "Run canvas_check when you are done. The runner then runs the lints and its measures once more, and puts this board back when they come out worse.",
    "End your reply with one line per finding, and nothing after them:",
    ...ANSWER_LINES,
    "",
    "<findings>",
    ...findings.map(findingLine),
    "</findings>",
  ].join("\n");
}

/** The whole loop's ledger as text: each round's findings, the drawer's answer under each, and what the round did not send. */
export function ledgerText(record: LoopRecord): string {
  const { rethink } = record;
  const turn = rethink ? [
    `## Rethink turn · exit ${rethink.exitCode ?? rethink.signal} · ${rethink.toolCalls.total} tool calls`
    + ` · ${rethink.moved.length ? `moved ${rethink.moved.map((move) => move.id).join(", ")}` : "no section moved"} · frame ${rethink.frame.before} → ${rethink.frame.after}`
    + ` · ${rethink.faults.before} → ${rethink.faults.after} computed findings`,
    ...Object.entries(rethink.answers).map(([name, answer]) => `${name}: ${answer || "no answer"}`),
    "",
  ] : [];
  const lines = record.rounds.flatMap((round) => [
    `## Round ${round.round}${round.check ? " (last review: no revise)" : ""} · score ${round.score} · ${round.regions} reviewers at ${round.effort}`,
    ...(round.findings.length ? [] : ["No findings."]),
    ...round.findings.flatMap((finding) => [
      findingLine(finding),
      ...(finding.facts ? [`  facts: ${finding.facts}`] : []),
      ...(finding.answer ? [`  → ${finding.answer.verdict}${finding.answer.reason ? `: ${finding.answer.reason}` : ""}${finding.answer.earned === false ? " (closes nothing: no section move)" : ""}`] : round.revise ? ["  → no answer"] : []),
    ]),
    ...(round.revise?.moved.length ? [`Sections moved in the revise pass: ${round.revise.moved.map((move) => `${move.id} (${move.dx}, ${move.dy})`).join(", ")}`] : []),
    ...round.withheld.map((fault) => `Not sent (${fault.why}): ${fault.id ? `${fault.id} ` : ""}[${fault.severity}, ${tagOf(fault)}] ${fault.ids.join(", ")}: ${sentence(fault.problem)}`
      + `${fault.why === "stuck" ? ` The drawer's last answer: ${fault.answer ? `${fault.answer.verdict}${fault.answer.reason ? `: ${fault.answer.reason}` : ""}` : "none"}` : ""}`),
    "",
  ]);
  const { last } = record;
  const kept = record.kept ? `Kept: round ${record.kept.round}${record.kept.restored ? ", restored" : ""}. ${sentence(record.kept.reason)}\n`
    + `${record.kept.lost?.length ? `Fixes the restore lost: ${record.kept.lost.join(", ")}\n` : ""}`
    + `${last ? `Last turn on round ${last.round}: sent ${last.sent.join(", ")} · ${Object.entries(last.answers).map(([id, answer]) => `${id} ${answer.verdict}`).join(", ") || "no answer"}`
      + ` · lints and computed checks ${last.checks.before} → ${last.checks.after}${last.undone ? " · undone: the kept board is back" : ""}\n` : ""}` : "";
  const unanswered = record.unanswered.length ? `No answer: ${record.unanswered.join(", ")}\n` : "";
  return `${[...turn, ...lines].join("\n")}Stop: ${record.stop}${record.error ? ` (${record.error})` : ""}\n${unanswered}${kept}`;
}

/** What the loop reads of one review. */
export function reviewOf(critique: CritiqueRecord): Review {
  const count = (kind: ReviewerKind) => critique.regions.filter((region) => region.kind === kind).length;
  return {
    reviewMs: critique.durationMs,
    renderMs: critique.renderMs,
    effort: critique.effort,
    reviewers: Object.fromEntries(REVIEWER_KINDS.map((kind) => [kind, count(kind)])) as Record<ReviewerKind, number>,
    regions: critique.regions.length,
    unparsed: critique.regions.filter((region) => region.error !== null).length,
    lints: critique.lints,
    findings: critique.findings,
    computed: critique.computed,
    layout: critique.layout,
  };
}

/**
 * The loop on one board file. Writes into `outDir`: rethink-before.canvas.json
 * (the first draw), rethink-transcript.jsonl and, when the reply left an
 * answer out, rethink-reask-transcript.jsonl; `round-<n>/` per round
 * (board.canvas.json and overview.png: the board as that round reviewed it;
 * guides.png, units/ and critique.json from critic.ts; highlights/ from
 * highlights.ts; revise-transcript.jsonl; and revise-reask-transcript.jsonl
 * when the reply left an id without an answer), last-transcript.jsonl (the
 * last turn after a restore), after.png (the board the loop kept), loop.json
 * (a LoopRecord) and findings.md (the ledger as text). A transcript holds the
 * message the drawer got, its images too, and its reply.
 *
 * The board file ends as the kept round's board, with the last turn's fixes
 * when it had one. Each drawer pass has exited by then, and the canvas server
 * saves inside a tool call, so nothing writes the file after a restore.
 */
export async function reviewBoard(options: {
  canvas: ReviewCanvas;
  /** The canvas id the drawer opens the board by. */
  board: string;
  boardPath: string;
  outDir: string;
  critic: CriticOptions;
  /** The board's brief, for the choices reviewer, or null when the run has none. */
  brief: string | null;
  /**
   * The drawer that revises: its folder (the canvas server's workspace, with
   * the board in canvases/), and the session to resume. Without a session the
   * first revise pass starts one. Undefined: one review, no revise.
   */
  drawer?: { dir: string; settingsPath: string; session?: string };
}): Promise<LoopRecord> {
  const { canvas, board, boardPath, outDir, drawer, critic } = options;
  const started = Date.now();
  const roundDir = (round: number) => resolve(outDir, `round-${round}`);
  const reviewed = (round: number) => resolve(roundDir(round), "board.canvas.json");
  const pass = drawer && drawerSession({ ...drawer, timeoutMs: critic.reviseTimeoutMs });
  const passed = (name: string, run: DrawerRun) =>
    process.stdout.write(`${board}: ${name} · exit ${run.exitCode ?? run.signal}${run.timedOut ? " (timed out)" : ""}${run.tries > 1 ? ` · ${run.tries} tries` : ""} · ${Math.round(run.durationMs / 1000)} s\n`);
  /** The review of the round the loop is in. */
  let critique: CritiqueRecord | null = null;
  /** What the runner measures on the board file as it stands. */
  const measured = () => checkBoard(canvas, canvas.toolkit.openCanvasFile(boardPath));
  /** The sections a drawer pass moved, from the board `round` reviewed to the board file as it stands. */
  const movedSince = (round: number, now = measured()) =>
    sectionMoves(canvas.toolkit.openCanvasFile(reviewed(round)).persisted as Board, now.board, now.plan.pageFrame?.id ?? null);
  const record = await reviewLoop({
    budget: critic.rounds,
    rethink: pass && (async () => {
      mkdirSync(outDir, { recursive: true });
      copyFileSync(boardPath, resolve(outDir, "rethink-before.canvas.json"));
      const before = measured();
      const transcript = resolve(outDir, "rethink-transcript.jsonl");
      const turn = await pass([rethinkMessage(board, before, gapRule(canvas.wires))], transcript);
      passed("rethink", turn.run);
      let answers = rethinkAnswers(readFileSync(transcript, "utf8"));
      let reask: RethinkRecord["reask"] = null;
      const asked = rethinkUnanswered(answers);
      if (asked.length > 0 && turn.run.exitCode === 0) {
        const again = resolve(outDir, "rethink-reask-transcript.jsonl");
        const second = await pass([rethinkReask(asked)], again);
        passed(`asked again for ${asked.join(", ")} after rethink`, second.run);
        answers = { ...answers, ...Object.fromEntries(Object.entries(rethinkAnswers(readFileSync(again, "utf8"))).filter(([, answer]) => answer)) };
        reask = { ...second.run, asked };
      }
      return rethinkRecord({ run: turn.run, transcript: readFileSync(transcript, "utf8"), answers, reask, before, after: measured() });
    }),
    review: async (round, earlier) => {
      mkdirSync(roundDir(round), { recursive: true });
      copyFileSync(boardPath, reviewed(round));
      critique = await critiqueBoard({ canvas, boardPath, outDir: roundDir(round), critic, brief: options.brief, earlier });
      process.stdout.write(`${board}: review ${round} · ${critiqueSummary(critique)}\n`);
      return reviewOf(critique);
    },
    revise: pass && (async (round, findings, notes) => {
      const file = canvas.toolkit.openCanvasFile(reviewed(round));
      const images = renderHighlights({
        canvas, file, limit: canvas.render.boardCameraAtWorldScale(file.persisted, file.session.canvasStyle),
        units: critique!.regions.map((region) => ({ id: region.region.id, kind: region.kind, rect: region.region, crops: region.crops })),
        findings, outDir: resolve(roundDir(round), "highlights"),
      });
      const revise = await pass(reviseMessage(board, findings, { ...notes, images }), resolve(roundDir(round), "revise-transcript.jsonl"));
      passed(`revise ${round}`, revise.run);
      return { ...revise, images: images.length, moved: movedSince(round) };
    }),
    reask: pass && (async (round, ids) => {
      const reask = await pass([reaskPrompt(ids)], resolve(roundDir(round), "revise-reask-transcript.jsonl"));
      passed(`asked again for ${ids.join(", ")} after revise ${round}`, reask.run);
      return reask;
    }),
    restore: drawer && ((round) => copyFileSync(reviewed(round), boardPath)),
    last: pass && (async (kept, findings) => {
      const turn = await pass([lastMessage(board, kept, findings)], resolve(outDir, "last-transcript.jsonl"));
      passed(`last turn on the board of round ${kept.round}`, turn.run);
      const now = measured();
      return { ...turn, moved: movedSince(kept.round, now), lints: now.lints, computed: now.plan.faults };
    }),
    timeUp: () => Date.now() - started > critic.loopTimeoutMs,
  });
  if (record.rethink || record.rounds.some((round) => round.revise)) {
    writeFileSync(resolve(outDir, "after.png"), renderBoardPng(canvas, canvas.toolkit.openCanvasFile(boardPath), undefined).png);
  }
  writeFileSync(resolve(outDir, "loop.json"), `${JSON.stringify(record, null, 2)}\n`);
  writeFileSync(resolve(outDir, "findings.md"), ledgerText(record));
  return record;
}

export function loopSummary(record: LoopRecord): string {
  const last = record.rounds.at(-1);
  const count = (severity: Severity) => last?.findings.filter((finding) => finding.severity === severity).length ?? 0;
  const withheld = record.rounds.reduce((sum, round) => sum + round.withheld.length, 0);
  const { rethink } = record;
  return `stop ${record.stop} after ${record.rounds.length} of ${record.budget} rounds${record.effort ? ` at ${record.effort} effort` : ""}`
    + `${rethink ? ` · rethink: ${rethink.toolCalls.total} tool calls, ${rethink.moved.length} ${rethink.moved.length === 1 ? "section" : "sections"} moved` : ""}`
    + ` · last round: ${SEVERITIES.map((severity) => `${count(severity)} ${severity}`).join(", ")}`
    + `${withheld ? ` · ${withheld} not sent (held, settled or stuck)` : ""}`
    + `${record.unanswered.length ? ` · no answer: ${record.unanswered.join(", ")}` : ""}`
    + `${record.kept ? ` · kept round ${record.kept.round}${record.kept.restored ? " (restored)" : ""}` : ""}`
    + `${record.last ? ` · last turn: ${record.last.sent.length} lost ${record.last.sent.length === 1 ? "fix" : "fixes"} sent again${record.last.undone ? ", undone" : ""}` : ""}`
    + ` · ${Math.round(record.durationMs / 1000)} s${record.error ? ` · ${record.error}` : ""}`;
}

/**
 * `climb critic --board <path> --out <dir> [--brief <brief.md>] [--revise on|off]
 * [--settings path]` and the critic flags (critic.ts CRITIC_FLAGS): the critic
 * step alone, on a board some drawer made before. `--brief` is the board's
 * brief, which the choices reviewer reads. `--revise off` (the default) is
 * one review of the board file. `--revise on` is the whole loop on a copy in
 * `<out>/canvases/`.
 */
export async function runCritique(argv: string[]): Promise<void> {
  const flags = parseFlags(argv, ["--board", "--out", "--brief", ...CRITIC_FLAGS, "--revise", "--settings"]);
  const boardFlag = flags.get("--board");
  const outFlag = flags.get("--out");
  if (!boardFlag || !outFlag) throw new Error("climb critic needs --board <canvas.json> and --out <dir>");
  const revise = flags.get("--revise") ?? "off";
  if (revise !== "on" && revise !== "off") throw new Error(`--revise must be on or off, not ${revise}`);
  const critic = parseCritic(flags);
  const source = resolve(boardFlag);
  if (!existsSync(source)) throw new Error(`No board at ${source}`);
  const brief = flags.has("--brief") ? readFileSync(resolve(flags.get("--brief")!), "utf8") : null;
  const outDir = resolve(outFlag);
  const board = basename(source).replace(/\.canvas\.json$/, "");
  let boardPath = source;
  let drawer: { dir: string; settingsPath: string } | undefined;
  if (revise === "on") {
    drawer = { dir: outDir, settingsPath: drawerFlags(flags).settingsPath };
    boardPath = resolve(outDir, "canvases", `${board}.canvas.json`);
    mkdirSync(dirname(boardPath), { recursive: true });
    copyFileSync(source, boardPath);
  }
  const record = await reviewBoard({ canvas: await loadReviewCanvas(), board, boardPath, outDir, critic, brief, drawer });
  process.stdout.write(`${board}: ${loopSummary(record)}\n`);
  if (record.stop === "failed" || record.rounds.some((round) => round.unparsed > 0)) process.exitCode = 1;
}
