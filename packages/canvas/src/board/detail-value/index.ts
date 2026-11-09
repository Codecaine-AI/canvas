/**
 * detail-value — does a node's one-line `detail` tell the reader anything?
 *
 * Every shape or icon with a detail becomes one Jev Choice question:
 * `keep` (the detail states a concrete fact the name, the section and the
 * wired neighbors do not) or `remove` (it restates, labels, or pads). The
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
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
export const DETAIL_PROMPT_VERSION = 3;

/**
 * A `remove` verdict at or above this confidence is an error finding.
 * Confidence on a two-option Choice is |2p − 1|, so 0.5 means p(remove) ≥ 0.75.
 * Calibrated with prompt version 3 on 1,664 details from the 14 Archon boards
 * and 62 replay boards. It removes 3 of 230 Archon details, all filler
 * ("defined workflow" twice, "runs the bundle's agent"), and 85 of 1,434
 * replay details. On a 40-row hand-read sample, 11 of the 12 removals at
 * this cut were filler (the miss: "discard partial work", a side effect).
 * At 0.4 or 0.3 the cut also removes Archon command names ("workflow wake,
 * workflow signal", "archon workflow signal"), so it stays at 0.5 and leaves
 * the weaker filler ("agent applies findings", p 0.68) on the board.
 */
export const DETAIL_REMOVE_THRESHOLD = 0.5;

/** Questions per request. Each question is small; this keeps a request far under the 64k context. */
const BATCH_SIZE = 40;

/** At most this many neighbor names go into a question; more only dilute it. */
const MAX_NEIGHBORS = 8;

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

/**
 * The nearest enclosing section that is not the page frame. The page frame's
 * title is the board title, which the request already states once.
 */
function sectionTitleOf(
  object: InteractiveCanvasObject,
  byId: ReadonlyMap<string, InteractiveCanvasObject>,
): string | null {
  let parentId = object.parentId ?? null;
  const seen = new Set<string>();
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) return null;
    if (parent.type === "section" && parent.parentId) return nameOf(parent) || null;
    parentId = parent.parentId ?? null;
  }
  return null;
}

/** Every shape or icon with a non-empty detail, with the context its question gets. */
export function detailSubjects(document: InteractiveCanvasDocument): DetailSubject[] {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const neighborIds = new Map<string, Set<string>>();
  for (const connection of document.connections) {
    const from = connection.from.objectId;
    const to = connection.to.objectId;
    if (from === to) continue;
    (neighborIds.get(from) ?? neighborIds.set(from, new Set()).get(from)!).add(to);
    (neighborIds.get(to) ?? neighborIds.set(to, new Set()).get(to)!).add(from);
  }
  const subjects: DetailSubject[] = [];
  for (const object of document.objects) {
    if (kindOf(object) !== "node") continue;
    const detail = (object.detail ?? "").replace(/\s+/g, " ").trim();
    if (detail === "") continue;
    const neighbors = [...new Set(
      [...(neighborIds.get(object.id) ?? [])]
        .map((id) => byId.get(id))
        .filter((neighbor): neighbor is InteractiveCanvasObject => neighbor !== undefined)
        .map(nameOf)
        .filter((name) => name !== ""),
    )].sort().slice(0, MAX_NEIGHBORS);
    subjects.push({ id: object.id, board: document.title ?? "", name: nameOf(object), detail, section: sectionTitleOf(object, byId), neighbors });
  }
  return subjects;
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
    ]))
    .digest("hex");
}

/** Whether a verdict is a finding: a `remove` Jev is sure enough of. */
export function isRemoval(verdict: DetailVerdict | undefined): verdict is DetailVerdict {
  return verdict !== undefined && verdict.choice === "remove" && verdict.confidence >= DETAIL_REMOVE_THRESHOLD;
}

/**
 * The two options. `keep` comes first on purpose: Jev leans slightly toward
 * the first option (TypeSafe's jaggedness notes), and a wrongly kept detail
 * costs less than a deleted fact. Each option says what it covers, what it
 * does not, and gives examples from outside any real board, so the
 * calibration boards stay unseen.
 */
const CRITERIA: JevChoiceQuestion["criteria"] = {
  keep: {
    what: "`node.detail` states a concrete, specific fact that a reader cannot get from `node.name`, `node.section` or `node.wired_to`.",
    counts_as_a_fact: [
      "a field, column, key or property name",
      "a file path, module, table, endpoint, command or URL",
      "a number: a limit, size, count, timeout, rate, port or version",
      "a trigger, event name or schedule",
      "a condition or cause: when or why it happens",
      "a status, such as proposed, reserved, later or not in version 1",
      "a payload, data shape, format or protocol",
      "a named product, model, library or host",
      "a variant that sets the box apart from sibling boxes of the same kind: inline or file, sync or async, local or remote, a mode or a source",
    ],
    examples: [
      { name: "Orders table", detail: "status, total_cents" },
      { name: "Rate limiter", detail: "100 req/min per key" },
      { name: "Webhook handler", detail: "on invoice.paid" },
      { name: "Session cache", detail: "Redis 7 · :6379" },
      { name: "Export job", detail: "nightly 02:00 UTC" },
      { name: "Retry skipped", detail: "card declined" },
      { name: "Billing API", detail: "proposed · not in v1" },
      { name: "Config", detail: "read from env, not a file" },
      { name: "Email sender", detail: "async · queued" },
    ],
  },
  remove: {
    what: "`node.detail` adds no concrete fact. A reader loses nothing if it is deleted.",
    counts_as_no_fact: [
      "it restates or paraphrases `node.name`",
      "it repeats `node.section` or the name of a box in `node.wired_to`",
      "it says in plain words what the box does, when the name already implies it",
      "it describes the box's job in generic words that fit many systems",
      "it says what kind of thing the box is, which its name already shows (a variant that sets it apart from its siblings is a fact, not a kind)",
      "it is a slogan, a vague summary, decoration or filler",
    ],
    examples: [
      { name: "Auth service", detail: "handles authentication" },
      { name: "Job queue", detail: "async processing" },
      { name: "Dashboard", detail: "the main user view" },
      { name: "Payment step", section: "Checkout", detail: "part of checkout" },
      { name: "Router", detail: "routes requests to services" },
      { name: "Content filter", detail: "safety layer" },
    ],
  },
};

/** One node's question. The node's facts ride in the instructions; the shared state is only the board title. */
export function detailQuestion(subject: DetailSubject): JevChoiceQuestion {
  return {
    type: "choice",
    instructions: {
      question: "Does `node.detail` give the reader a concrete fact that `node.name`, `node.section` and `node.wired_to` do not already give?",
      context: "`node` is one box on a diagram titled `board_title`. `node.name` is the box's label. `node.detail` is the one small line printed under the label. `node.section` is the titled group the box sits in. `node.wired_to` lists the boxes connected to it by arrows.",
      node: {
        name: subject.name,
        detail: subject.detail,
        section: subject.section ?? "(none)",
        wired_to: subject.neighbors,
      },
    },
    criteria: CRITERIA,
  };
}

/** One board's requests: the board title as state, one question per subject, in batches. */
export function detailRequests(boardTitle: string, subjects: readonly DetailSubject[]): JevRequest[] {
  const requests: JevRequest[] = [];
  for (let start = 0; start < subjects.length; start += BATCH_SIZE) {
    const batch = subjects.slice(start, start + BATCH_SIZE);
    requests.push({
      model: DETAIL_VALUE_MODEL,
      state: { board_title: boardTitle },
      questions: Object.fromEntries(batch.map((subject, index) => [`n${start + index}`, detailQuestion(subject)])),
    });
  }
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

  const requests = detailRequests(document.title ?? "", missing);
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
      const all = (entries = { ...entries, ...read() });
      for (const [key, verdict] of fresh) all[key] = verdict;
      try {
        mkdirSync(dirname(path), { recursive: true });
        const temp = `${path}.${process.pid}.tmp`;
        writeFileSync(temp, `${JSON.stringify({ entries: all })}\n`);
        renameSync(temp, path);
      } catch {
        // Keep the in-memory verdicts; the next check can try the write again.
      }
    },
  };
}
