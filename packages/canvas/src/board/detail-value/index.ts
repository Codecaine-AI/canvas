/**
 * detail-value — does a node's one-line `detail` tell the reader anything?
 *
 * Every shape or icon with a detail becomes one Jev Choice question:
 * `remove` by default, `keep` only when the detail states an exact fact that
 * is stated nowhere else on the board: not in the name, the section, the
 * wired neighbors or their wire labels, the other details in the section,
 * the sticky notes, or the board title. The
 * questions of one board go in one request (Jev evaluates them in parallel,
 * so a batch costs about one call), and every answer is cached by a hash of
 * what the question saw, so checking an unchanged node again costs nothing.
 *
 * Only canvas_check asks (`judgeDetails` is async and calls the network);
 * the `detail-value` lint (../lints/rules/detail-value.ts) is synchronous and
 * reads the verdicts the session already holds. That split keeps every edit's
 * lint pass offline while finalize still blocks on a known `remove`.
 *
 * The question text below is the product: it decides what Ford sees removed.
 * Change it and bump DETAIL_PROMPT_VERSION, so no cached verdict outlives the
 * question that produced it, then recalibrate DETAIL_REMOVE_THRESHOLD.
 */
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import { kindOf } from "../helpers";
import {
  JevRateLimiter,
  requestJev,
  type JevChoiceQuestion,
  type JevRequest,
  type JevRequestOptions,
  type JevUsage,
} from "./jev";

/** A pinned model id, not the moving `jev-latest` alias: the threshold is calibrated against it. */
export const DETAIL_VALUE_MODEL = "jev-1.14.0";

/** Bump when the question, the options, or the state shape changes. Part of every cache key. */
export const DETAIL_PROMPT_VERSION = 6;

/**
 * A `remove` verdict at or above this confidence is an error finding.
 * Confidence on a two-option Choice is |2p − 1|, so 0.1 means p(remove) ≥ 0.55.
 * Calibrated with prompt version 6 on the 14 Archon boards (230 details)
 * against Ford's bar: a detail stays only when it adds a fact stated nowhere
 * else on the board, sticky notes included. The labels are a 40-row
 * independent review plus a relabel of the rest against the same bar (56
 * remove). Over two runs this cut agrees with the 40-row review on 37 and
 * 38 rows, and with all 230 on 214 and 212 (2 or 3 useful details removed,
 * 14 or 15 redundant ones kept). Jev's p(remove) moves 0.02 on average
 * between runs, 0.13 at most. At p ≥ 0.7 it removes 1 useful detail but
 * keeps 20 or more redundant ones; at p ≥ 0.5 it removes 4 or 5 useful ones.
 * Its wrong removals are exact facts beside words the board already states
 * ("command-center · version 1" under a "version 1" wire).
 */
export const DETAIL_REMOVE_THRESHOLD = 0.1;

/** At most this many questions go in one request. */
const BATCH_SIZE = 40;

/**
 * At most this many JSON characters go in one request. Jev refuses a request
 * of about 64k input tokens (HTTP 400): a 192k-character request of 32
 * questions passed at 58k tokens, and a 216k-character one failed. Each
 * question carries its board context, so a board's questions are split by
 * size, well under that limit.
 */
const REQUEST_CHARS = 120_000;

/** At most this many neighbor names go into a question; more only dilute it. */
const MAX_NEIGHBORS = 8;

/**
 * Size caps for the board context. A note longer than NOTE_CHARS is cut, and
 * notes stop once their total passes NOTES_CHARS. A question gets the other
 * details in its section and on its wired neighbors, each cut to OTHER_CHARS,
 * until their total passes OTHERS_CHARS, and at most MAX_WIRE_LABELS wire
 * labels. Archon's largest board sends 1,251 note characters, under these caps.
 */
const NOTE_CHARS = 800;
const NOTES_CHARS = 3_000;
const OTHER_CHARS = 140;
const OTHERS_CHARS = 3_000;
const MAX_WIRE_LABELS = 8;

/** What one question sees about one node. */
export interface DetailSubject {
  id: string;
  /** The board title, which the request sends as state. */
  board: string;
  name: string;
  detail: string;
  /** The title of the nearest enclosing section, or null on the page itself. */
  section: string | null;
  /** The names of the boxes wired to this node, either direction, sorted and deduplicated. */
  neighbors: string[];
  /** The labels on the wires touching this node, sorted and deduplicated. */
  wireLabels: string[];
  /**
   * The other details near this node, as `name: detail` in board order: every
   * box in the same section and every wired neighbor, except a box with
   * another name and this exact detail. Details farther away were tried and
   * made Jev remove more details that only look alike.
   */
  otherDetails: string[];
  /** The text of every sticky note on the board (shared by every subject of the board). */
  notes: string[];
}

export interface DetailVerdict {
  choice: "keep" | "remove";
  /** Jev's confidence in `choice`, 0..1. */
  confidence: number;
  /** p(remove), kept for calibration reports. */
  pRemove: number;
  /** The model id that answered. */
  model: string;
}

/** Where verdicts persist between checks. */
export interface DetailVerdictCache {
  get(key: string): DetailVerdict | undefined;
  set(entries: ReadonlyArray<readonly [string, DetailVerdict]>): void;
}

/** The visible name of an object: its text on one line. */
function nameOf(object: InteractiveCanvasObject): string {
  return (object.text ?? "").replace(/\s+/g, " ").trim();
}

/** Cut `text` to `max` characters, marking the cut. */
function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * The text of every sticky note, in board order, on one line each with the
 * Markdown heading and emphasis marks dropped (code spans stay: they mark the
 * exact identifiers a detail might repeat). Capped by NOTE_CHARS and NOTES_CHARS.
 */
export function boardNotes(document: InteractiveCanvasDocument): string[] {
  const notes: string[] = [];
  let total = 0;
  for (const object of document.objects) {
    if (kindOf(object) !== "sticky") continue;
    const text = (object.text ?? "")
      .replace(/^\s{0,3}#{1,6}\s+/gm, "")
      .replace(/\*\*|__/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (text === "") continue;
    const note = cut(text, NOTE_CHARS);
    if (total + note.length > NOTES_CHARS) break;
    total += note.length;
    notes.push(note);
  }
  return notes;
}

/**
 * The nearest enclosing section that is not the page frame. The page frame's
 * title is the board title, which the request already states once.
 */
function sectionOf(
  object: InteractiveCanvasObject,
  byId: ReadonlyMap<string, InteractiveCanvasObject>,
): InteractiveCanvasObject | null {
  let parentId = object.parentId ?? null;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return null;
    if (parent.type === "section" && parent.parentId) return parent;
    parentId = parent.parentId ?? null;
  }
  return null;
}

const detailOf = (object: InteractiveCanvasObject): string => (object.detail ?? "").replace(/\s+/g, " ").trim();

/** Add `value` to the set stored under `key`, creating the set on first use. */
function addTo<T>(map: Map<string, Set<T>>, key: string, value: T): void {
  (map.get(key) ?? map.set(key, new Set()).get(key)!).add(value);
}

/**
 * Every shape or icon with a non-empty detail, with the board context its
 * question gets: what else on the board could already state the same fact.
 */
export function detailSubjects(document: InteractiveCanvasDocument): DetailSubject[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const neighborIds = new Map<string, Set<string>>();
  const wireLabels = new Map<string, Set<string>>();
  for (const connection of document.connections) {
    const from = connection.from.objectId;
    const to = connection.to.objectId;
    const label = (connection.label ?? "").replace(/\s+/g, " ").trim();
    if (label !== "") {
      addTo(wireLabels, from, label);
      addTo(wireLabels, to, label);
    }
    if (from === to) continue;
    addTo(neighborIds, from, to);
    addTo(neighborIds, to, from);
  }
  const withDetail = document.objects
    .filter((object) => kindOf(object) === "node" && detailOf(object) !== "")
    .map((object) => ({ object, detail: detailOf(object), section: sectionOf(object, byId) }));
  const notes = boardNotes(document);
  return withDetail.map(({ object, detail, section }) => {
    const neighbors = [...new Set(
      [...(neighborIds.get(object.id) ?? [])]
        .map((id) => byId.get(id))
        .filter((neighbor): neighbor is InteractiveCanvasObject => neighbor !== undefined)
        .map(nameOf)
        .filter((name) => name !== ""),
    )].sort().slice(0, MAX_NEIGHBORS);
    const wired = neighborIds.get(object.id);
    const name = nameOf(object);
    // The same words on a box with another name state a fact about that box
    // ("later" on both `schedule` and `webhook`), so they never make this
    // detail redundant. The same words on a box with the same name do.
    const near = (other: (typeof withDetail)[number]) =>
      (other.section === section || wired?.has(other.object.id) === true)
      && !(other.detail === detail && nameOf(other.object) !== name);
    const otherDetails: string[] = [];
    let total = 0;
    for (const other of withDetail.filter((other) => other.object !== object && near(other))) {
      const line = cut(`${nameOf(other.object)}: ${other.detail}`, OTHER_CHARS);
      if (total + line.length > OTHERS_CHARS) break;
      total += line.length;
      otherDetails.push(line);
    }
    return {
      id: object.id,
      board: document.title ?? "",
      name,
      detail,
      section: section ? nameOf(section) || null : null,
      neighbors,
      wireLabels: [...(wireLabels.get(object.id) ?? [])].sort().slice(0, MAX_WIRE_LABELS),
      otherDetails,
      notes,
    };
  });
}

/** The cache key: everything the question saw (board title included), plus the prompt version and model. */
export function detailKey(subject: DetailSubject): string {
  return createHash("sha256")
    .update(JSON.stringify([
      DETAIL_PROMPT_VERSION,
      DETAIL_VALUE_MODEL,
      subject.board,
      subject.name,
      subject.detail,
      subject.section,
      subject.neighbors,
      subject.wireLabels,
      subject.otherDetails,
      subject.notes,
    ]))
    .digest("hex");
}

/** Whether a verdict is a finding: a `remove` Jev is sure enough of. */
export function isRemoval(verdict: DetailVerdict | undefined): verdict is DetailVerdict {
  return verdict !== undefined && verdict.choice === "remove" && verdict.confidence >= DETAIL_REMOVE_THRESHOLD;
}

/**
 * The two options. `remove` is the default and comes first: Jev leans
 * slightly toward the first option (TypeSafe's jaggedness notes), and Ford's
 * bar is that a detail stays only when it adds context that would not
 * otherwise be there: a fact stated nowhere else on the board, notes
 * included. `keep` is narrow, but it wins over the remove list: one novel
 * exact fact keeps the detail even when the rest of it is a role or a
 * paraphrase. Every example comes from outside any real board, so the
 * calibration boards stay unseen.
 */
const CRITERIA: JevChoiceQuestion["criteria"] = {
  remove: {
    what: "The default. Deleting `node.detail` loses no exact fact: every fact in it is stated somewhere else on the board, or it states no exact fact at all.",
    counts_as_remove: [
      "every exact fact in it already appears in `board_notes`, in `node.other_details`, or in `node.wire_labels`, in any words",
      "it says what the box does, its job or its role, in any words, and holds no exact fact",
      "it restates or paraphrases `node.name`, or is `node.name` with a prefix or suffix",
      "it says what kind or category of thing the box is",
      "it states a property the name already implies, such as an id being unique or a cancel step ending the run",
      "it repeats `node.section`, `board_title`, or the name of a box in `node.wired_to`, or a count a reader can see from the wires",
      "it is vague: a size, speed or status with no number or exact value, such as small, fast, grows over time or not measured",
      "it is a slogan, a summary, decoration or filler",
    ],
    examples: [
      { name: "Auth service", detail: "handles authentication" },
      { name: "Email worker", detail: "sends the outgoing emails" },
      { name: "Image cache", detail: "a caching layer" },
      { name: "user_id", detail: "the user's unique id" },
      { name: "resize", detail: "image-resize" },
      { name: "Fan-out", wired_to: ["Mobile push", "SMS", "Web push"], detail: "one of 3 channels" },
      { name: "Upload bucket", detail: "small today, grows with use" },
      { name: "Reject", detail: "stops the request" },
      { name: "Payment step", section: "Checkout", detail: "part of checkout" },
      { name: "thumbnail", board_notes: ["Thumbnail step: sharp resizes to max 4096 px; stdout is the image"], detail: "sharp, stdout is the image" },
      { name: "Retry loop", board_notes: ["Retry the charge until it clears, at most 3 attempts"], detail: "until it clears, max 3" },
      { name: "invoice row", other_details: ["invoice row: amount_cents · due_at", "Invoices table: id, amount_cents, due_at"], detail: "amount_cents · due_at" },
      { name: "Export", wire_labels: ["nightly 02:00 UTC"], detail: "runs nightly 02:00 UTC" },
    ],
  },
  keep: {
    what: "`node.detail` states at least one exact fact that appears nowhere else on the board: not in `node.name`, `node.section`, `node.wired_to`, `node.wire_labels`, `node.other_details`, `board_notes` or `board_title`. Such a fact keeps the detail even when the rest of the line says what the box does.",
    counts_as_keep: [
      "an exact identifier: a file path, file and line, package, table, column, field, key, event name, command or URL",
      "a command a person or script types, even in plain words that echo the name, such as a CLI subcommand",
      "a value the system's own config reads: a step type, a mode, a flag, a join rule or a model tier such as `model: small`",
      "an exact value: a host, IP or port, a model id, a version, or a size, count, limit, timeout or threshold with its number",
      "the unit a field is measured in, such as ms, bytes or rows",
      "a schema, type, format or protocol name",
      "the named product, library or machine it uses or runs on",
      "its scope status: in version 1, later, proposed or not installed",
      "a non-obvious condition or side effect stated precisely: when it runs, what it writes, what it skips",
      "one of the above that is new, next to words the board already states: the new fact keeps the whole line",
      "the same words on a box with another name: there they state a fact about that box, not this one",
    ],
    examples: [
      { name: "Orders table", detail: "status, total_cents" },
      { name: "Thumbnail worker", detail: "sharp 0.33 · max 4096 px" },
      { name: "Session cache", detail: "Redis 7 · :6379" },
      { name: "Config loader", detail: "src/config/load.ts" },
      { name: "Roll back", detail: "fly releases rollback" },
      { name: "Pause or resume", detail: "queue pause, queue resume" },
      { name: "on_timeout", detail: "jobs retry --last" },
      { name: "ttl", detail: "seconds since last write" },
      { name: "Classify", detail: "model: fast · tags each ticket" },
      { name: "Summarize", detail: "llm step · small tier · writes summary.md" },
      { name: "Webhook handler", detail: "on invoice.paid" },
      { name: "Export job", detail: "nightly 02:00 UTC" },
      { name: "Billing API", detail: "proposed · not in v1" },
      { name: "Retry", detail: "skipped when the card is declined" },
      { name: "Cache", board_notes: ["Every store in version 1 runs on services-02"], detail: "Redis 7 · services-02" },
      { name: "webhook", other_details: ["cron: later · not in v1"], detail: "later · not in v1" },
    ],
  },
};

/** One node's question. The node and its neighborhood ride in the instructions; the board title and notes are shared state. */
export function detailQuestion(subject: DetailSubject): JevChoiceQuestion {
  return {
    type: "choice",
    instructions: {
      question: "Does `node.detail` add an exact fact that is stated nowhere else on the board? Answer `remove` when it states no exact fact, or when every exact fact in it is already in `board_notes`, `node.other_details`, `node.wire_labels`, `node.name`, `node.section`, `node.wired_to` or `board_title`. Answer `keep` when it holds even one exact fact found nowhere else, even if the rest of the line describes the box's role.",
      context: "`node` is one box on a diagram titled `board_title`. `node.name` is the box's label. `node.detail` is the one small line printed under the label. `node.section` is the titled group the box sits in. `node.wired_to` lists the boxes connected to it by arrows, and `node.wire_labels` the text on those arrows. `node.other_details` lists the details of the other boxes in the same group and of the wired boxes as `name: detail`, so a detail repeated on one of them is stated elsewhere. `board_notes` holds the text of every sticky note on the board. A detail line costs the reader attention, so it stays only when it adds a fact the reader cannot read anywhere else on the board.",
      node: {
        name: subject.name,
        detail: subject.detail,
        section: subject.section ?? "(none)",
        wired_to: subject.neighbors,
        wire_labels: subject.wireLabels,
        other_details: subject.otherDetails,
      },
    },
    criteria: CRITERIA,
  };
}

/** The state every question about one board shares: its title and its notes. */
export interface DetailBoard {
  title: string;
  notes: string[];
}

/**
 * One board's requests: the board title and notes as state, one question per
 * subject, in batches of at most BATCH_SIZE questions and REQUEST_CHARS
 * characters. Question ids are `n<index into subjects>`.
 */
export function detailRequests(board: DetailBoard, subjects: readonly DetailSubject[]): JevRequest[] {
  const state = { board_title: board.title, board_notes: board.notes };
  const base = JSON.stringify({ model: DETAIL_VALUE_MODEL, state, questions: {} }).length;
  const requests: JevRequest[] = [];
  let questions: Record<string, JevChoiceQuestion> = {};
  let count = 0;
  let size = base;
  subjects.forEach((subject, index) => {
    const id = `n${index}`;
    const question = detailQuestion(subject);
    const added = JSON.stringify({ [id]: question }).length;
    if (count > 0 && (count === BATCH_SIZE || size + added > REQUEST_CHARS)) {
      requests.push({ model: DETAIL_VALUE_MODEL, state, questions });
      questions = {};
      count = 0;
      size = base;
    }
    questions[id] = question;
    count += 1;
    size += added;
  });
  if (count > 0) requests.push({ model: DETAIL_VALUE_MODEL, state, questions });
  return requests;
}

export type DetailJudgement =
  | {
    status: "checked";
    subjects: DetailSubject[];
    /** Every subject's verdict, keyed by `detailKey`. */
    verdicts: Map<string, DetailVerdict>;
    /** Subjects sent to Jev this time; the rest came from the cache. */
    asked: number;
    usage: JevUsage;
  }
  | { status: "not-checked"; reason: string };

export interface JudgeDetailsOptions {
  /** TYPESAFE_API_KEY. Missing or empty: nothing is asked and the result says why. */
  apiKey: string | undefined;
  cache: DetailVerdictCache;
  fetch?: typeof fetch;
  sleep?: JevRequestOptions["sleep"];
  limiter?: JevRequestOptions["limiter"];
  timeoutMs?: number;
}

/** One limiter per process, so concurrent checks share the request rate. */
const sharedLimiter = new JevRateLimiter(12);

/**
 * Judge every node detail on the board: cached verdicts first, then one Jev
 * request per batch of the rest. Never throws: a missing key (even with every
 * verdict cached) or a failed
 * request is a `not-checked` result with the reason, and nothing is cached
 * from a failed run.
 */
export async function judgeDetails(
  document: InteractiveCanvasDocument,
  options: JudgeDetailsOptions,
): Promise<DetailJudgement> {
  // No key is no check, even when every verdict is cached: the documented bypass blocks nothing.
  const apiKey = options.apiKey?.trim();
  if (!apiKey) return { status: "not-checked", reason: "TYPESAFE_API_KEY is not set" };
  const subjects = detailSubjects(document);
  const verdicts = new Map<string, DetailVerdict>();
  const missing: DetailSubject[] = [];
  const missingKeys = new Set<string>();
  for (const subject of subjects) {
    const key = detailKey(subject);
    const cached = options.cache.get(key);
    if (cached) verdicts.set(key, cached);
    else if (!missingKeys.has(key)) {
      missingKeys.add(key);
      missing.push(subject);
    }
  }
  const usage: JevUsage = { input_tokens: 0, output_tokens: 0 };
  if (missing.length === 0) return { status: "checked", subjects, verdicts, asked: 0, usage };

  const requests = detailRequests({ title: document.title ?? "", notes: boardNotes(document) }, missing);
  let responses;
  try {
    responses = await Promise.all(requests.map((request) => requestJev(request, {
      apiKey,
      limiter: options.limiter ?? sharedLimiter,
      fetch: options.fetch,
      sleep: options.sleep,
      timeoutMs: options.timeoutMs,
    })));
  } catch (error) {
    return { status: "not-checked", reason: error instanceof Error ? error.message : String(error) };
  }
  const fresh: Array<readonly [string, DetailVerdict]> = [];
  responses.forEach(({ response }, batch) => {
    usage.input_tokens += response.usage.input_tokens;
    usage.output_tokens += response.usage.output_tokens;
    for (const id of Object.keys(requests[batch]!.questions)) {
      const subject = missing[Number(id.slice(1))]!;
      const answer = response.answers[id]!;
      const verdict: DetailVerdict = {
        choice: answer.choice === "remove" ? "remove" : "keep",
        confidence: answer.confidence,
        pRemove: answer.probabilities.remove ?? 0,
        model: response.model,
      };
      const key = detailKey(subject);
      verdicts.set(key, verdict);
      fresh.push([key, verdict]);
    }
  });
  options.cache.set(fresh);
  return { status: "checked", subjects, verdicts, asked: missing.length, usage };
}

/** A cache that lives as long as the process. */
export function memoryDetailCache(): DetailVerdictCache {
  const entries = new Map<string, DetailVerdict>();
  return {
    get: (key) => entries.get(key),
    set: (fresh) => { for (const [key, verdict] of fresh) entries.set(key, verdict); },
  };
}

/**
 * A cache kept in one JSON file, read once and rewritten atomically on each
 * set. Each set rereads the file and merges per key before it writes, so two
 * caches on one file (two server processes) keep each other's verdicts. The
 * cache is a convenience: an unreadable file starts empty, and a failed write
 * keeps the verdicts in memory.
 */
export function fileDetailCache(path: string): DetailVerdictCache {
  let entries: Record<string, DetailVerdict> | null = null;
  const read = (): Record<string, DetailVerdict> => {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as { entries?: Record<string, DetailVerdict> };
      return parsed.entries && typeof parsed.entries === "object" ? parsed.entries : {};
    } catch {
      return {};
    }
  };
  return {
    get: (key) => (entries ??= read())[key],
    set: (fresh) => {
      if (fresh.length === 0) return;
      for (const [key, verdict] of fresh) (entries ??= {})[key] = verdict;
      try {
        mkdirSync(dirname(path), { recursive: true });
      } catch {
        return;
      }
      // Read, merge and write under one lock file, so writers in other
      // processes never drop each other's verdicts.
      withFileLock(`${path}.lock`, () => {
        const all = (entries = { ...read(), ...entries });
        for (const [key, verdict] of fresh) all[key] = verdict;
        const temp = `${path}.${process.pid}.tmp`;
        writeFileSync(temp, `${JSON.stringify({ entries: all })}\n`);
        renameSync(temp, path);
      });
    },
  };
}

/** How long a writer waits for the cache lock, and when a lock counts as stale. */
const LOCK_WAIT_MS = 2_000;
const LOCK_STALE_MS = 10_000;

/**
 * Run `work` while holding an exclusive lock file (created with the `wx`
 * flag, which fails when it exists). A lock older than LOCK_STALE_MS is a
 * crashed writer's and is taken over. When the lock stays busy past
 * LOCK_WAIT_MS, or any step fails, `work` is skipped: the cache is a
 * convenience, and the next check asks Jev again.
 */
function withFileLock(lockPath: string, work: () => void): void {
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try {
      closeSync(openSync(lockPath, "wx"));
      break;
    } catch {
      try {
        if (Date.now() - statSync(lockPath).mtimeMs > LOCK_STALE_MS) unlinkSync(lockPath);
      } catch {
        // The holder released it between the two calls; try again.
      }
      if (Date.now() > deadline) return;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
    }
  }
  try {
    work();
  } catch {
    // Keep the in-memory verdicts; the next check can try the write again.
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      // Already gone.
    }
  }
}
