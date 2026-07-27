import { createReadStream, promises as fs } from "node:fs";
import { get as httpGet } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { join, resolve, sep } from "node:path";

/**
 * Eval-runs read API for the dev-gated Evals page. Serves the historical run
 * artifacts the eval-suite runner writes under packages/eval-suite/runs/:
 *
 *   /api/evals/runs                     run listing, newest first
 *   /api/evals/runs/:id                 progress + scorecard + scenario manifest
 *   /api/evals/runs/:id/files/<path>    raw artifact files (png/json/md/log)
 *
 * Read-only by design — a suite run may be writing these directories while
 * studio reads them, so every file is re-read per request (no caching) and
 * partial/missing artifacts degrade to nulls instead of errors.
 */

const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const FILE_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/i;
const STAGE_FILE_PATTERN = /^(stage0|e\d+)\.(png|json)$/;
const JUDGE_FILE_PATTERN = /^judge-([a-z0-9]+)\.json$/;

/** The eval file API that serves live boards while a suite run is active. */
const LIVE_EVAL_API_ORIGIN = "http://127.0.0.1:4010";
const LIVE_PROBE_TIMEOUT_MS = 400;

const FILE_CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".json": "application/json; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

type EvalRunSummary = {
  run_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  scenario_count: number;
  has_scorecard: boolean;
  mean_score: number | null;
};

type EvalStage = {
  name: string;
  png: boolean;
};

type EvalJudge = {
  axis: string;
  score: number | null;
  flags: string[];
};

type EvalScenarioManifest = {
  scenario: string;
  stages: EvalStage[];
  judges: EvalJudge[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(`${JSON.stringify(payload)}\n`);
}

async function readJsonFile(filePath: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
  } catch {
    return null;
  }
}

async function readTextFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    return (await fs.stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Mean of the per-axis mean scores in scorecard.json, or null when empty. */
function scorecardMeanScore(scorecard: unknown): number | null {
  if (!isRecord(scorecard) || !isRecord(scorecard.means)) return null;
  const scores = scorecard.means.scores;
  if (!isRecord(scores)) return null;
  const values = Object.values(scores).filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stageSortKey(name: string): number {
  return name === "stage0" ? -1 : Number.parseInt(name.slice(1), 10);
}

async function listScenarioDirs(runDir: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(runDir, { withFileTypes: true });
  } catch {
    return [];
  }
  // A scenario directory is recognized structurally — by the artifacts the
  // runner writes into it — so any scenario naming scheme works.
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !FILE_SEGMENT_PATTERN.test(entry.name)) continue;
    const markers = ["scenario_result.json", "scenario.log", "sessions.md"];
    const isScenario = await Promise.all(
      markers.map((marker) =>
        fs.access(join(runDir, entry.name, marker)).then(() => true, () => false),
      ),
    ).then((results) => results.some(Boolean));
    if (isScenario) names.push(entry.name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

async function scenarioManifest(
  runDir: string,
  scenario: string,
): Promise<EvalScenarioManifest> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(resolve(runDir, scenario));
  } catch {
    // A scenario directory can vanish or be unreadable mid-run; report it empty.
  }

  const stagesByName = new Map<string, EvalStage>();
  for (const entry of entries) {
    const match = entry.match(STAGE_FILE_PATTERN);
    if (!match) continue;
    const stage = stagesByName.get(match[1]) ?? { name: match[1], png: false };
    if (match[2] === "png") stage.png = true;
    stagesByName.set(match[1], stage);
  }
  const stages = [...stagesByName.values()].sort(
    (a, b) => stageSortKey(a.name) - stageSortKey(b.name),
  );

  const judges: EvalJudge[] = [];
  for (const entry of entries.sort()) {
    const match = entry.match(JUDGE_FILE_PATTERN);
    if (!match) continue;
    const parsed = await readJsonFile(resolve(runDir, scenario, entry));
    judges.push({
      axis: match[1],
      score:
        isRecord(parsed) && typeof parsed.score === "number" ? parsed.score : null,
      flags:
        isRecord(parsed) && Array.isArray(parsed.flags)
          ? parsed.flags.filter((flag): flag is string => typeof flag === "string")
          : [],
    });
  }

  return { scenario, stages, judges };
}

async function summarizeRun(runsDir: string, runId: string): Promise<EvalRunSummary> {
  const runDir = resolve(runsDir, runId);
  const progress = await readJsonFile(resolve(runDir, "run_progress.json"));
  const hasScorecard = await fileExists(resolve(runDir, "scorecard.json"));
  const scorecard = hasScorecard
    ? await readJsonFile(resolve(runDir, "scorecard.json"))
    : null;
  const scenarios = await listScenarioDirs(runDir);

  const progressRecord = isRecord(progress) ? progress : null;
  return {
    run_id: runId,
    status: stringOrNull(progressRecord?.status) ?? "unknown",
    started_at: stringOrNull(progressRecord?.started_at),
    finished_at: stringOrNull(progressRecord?.finished_at),
    scenario_count: scenarios.length,
    has_scorecard: hasScorecard,
    mean_score: scorecardMeanScore(scorecard),
  };
}

/** True when the live eval file API on :4010 answers within the timeout. */
function probeLiveEvalApi(): Promise<boolean> {
  return new Promise((resolveProbe) => {
    const request = httpGet(
      LIVE_EVAL_API_ORIGIN,
      { timeout: LIVE_PROBE_TIMEOUT_MS },
      (response) => {
        response.resume();
        resolveProbe(true);
      },
    );
    request.on("timeout", () => request.destroy());
    request.on("error", () => resolveProbe(false));
  });
}

async function handleListRuns(runsDir: string, res: ServerResponse) {
  let entries;
  try {
    entries = await fs.readdir(runsDir, { withFileTypes: true });
  } catch {
    sendJson(res, 200, { runs: [] });
    return;
  }

  const runs: (EvalRunSummary & { sort_key: string })[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !RUN_ID_PATTERN.test(entry.name)) continue;
    const summary = await summarizeRun(runsDir, entry.name);
    let mtime = "";
    try {
      mtime = (await fs.stat(resolve(runsDir, entry.name))).mtime.toISOString();
    } catch {
      // Sort keyless runs last; the listing itself should still include them.
    }
    runs.push({ ...summary, sort_key: summary.started_at ?? mtime });
  }
  runs.sort((a, b) => b.sort_key.localeCompare(a.sort_key));
  sendJson(res, 200, {
    runs: runs.map(({ sort_key: _sortKey, ...summary }) => summary),
  });
}

async function handleRunDetail(runsDir: string, runId: string, res: ServerResponse) {
  const runDir = resolve(runsDir, runId);
  try {
    if (!(await fs.stat(runDir)).isDirectory()) throw new Error("not a directory");
  } catch {
    sendJson(res, 404, { error: "Run not found." });
    return;
  }

  const progress = await readJsonFile(resolve(runDir, "run_progress.json"));
  const scorecard = await readJsonFile(resolve(runDir, "scorecard.json"));
  const fingerprintMd = await readTextFile(resolve(runDir, "fingerprint.md"));
  const scenarioIds = await listScenarioDirs(runDir);
  const scenarios = [];
  for (const scenario of scenarioIds) {
    scenarios.push(await scenarioManifest(runDir, scenario));
  }

  const progressRecord = isRecord(progress) ? progress : null;
  const status = stringOrNull(progressRecord?.status) ?? "unknown";
  const live =
    status === "running"
      ? { available: await probeLiveEvalApi(), origin: LIVE_EVAL_API_ORIGIN }
      : null;

  sendJson(res, 200, {
    run_id: runId,
    status,
    progress: progressRecord,
    scorecard: isRecord(scorecard) ? scorecard : null,
    fingerprint_md: fingerprintMd,
    scenarios,
    live,
  });
}

async function handleRunFile(
  runsDir: string,
  runId: string,
  segments: string[],
  res: ServerResponse,
) {
  const extension = segments.at(-1)?.match(/(\.[a-z0-9]+)$/)?.[1] ?? "";
  const contentType = FILE_CONTENT_TYPES[extension];
  if (
    segments.length === 0 ||
    !segments.every((segment) => FILE_SEGMENT_PATTERN.test(segment)) ||
    !contentType
  ) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  const runDir = resolve(runsDir, runId);
  const filePath = resolve(runDir, ...segments);
  const confinedRoot = runDir.endsWith(sep) ? runDir : `${runDir}${sep}`;
  if (!filePath.startsWith(confinedRoot)) {
    sendJson(res, 404, { error: "Not found." });
    return;
  }

  // realpath resolves symlinks, so a link pointing outside the run directory
  // fails this containment check even though the literal path passed above.
  try {
    const realPath = await fs.realpath(filePath);
    const realRoot = `${await fs.realpath(runDir)}${sep}`;
    if (!realPath.startsWith(realRoot)) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }
    const stat = await fs.stat(realPath);
    if (!stat.isFile()) {
      sendJson(res, 404, { error: "Not found." });
      return;
    }
    res.statusCode = 200;
    res.setHeader("content-type", contentType);
    res.setHeader("content-length", stat.size);
    res.setHeader("cache-control", "no-cache");
    createReadStream(realPath)
      .on("error", () => {
        if (!res.headersSent) sendJson(res, 500, { error: "Read failed." });
        else res.destroy();
      })
      .pipe(res);
  } catch {
    sendJson(res, 404, { error: "Not found." });
  }
}

export function createEvalsApiHandler(options: {
  runsDir: string;
}): (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void {
  const { runsDir } = options;

  return (req, res, next) => {
    if (!req.url?.startsWith("/api/evals")) {
      next();
      return;
    }

    void (async () => {
      try {
        const url = new URL(req.url!, "http://studio.local");
        const parts = url.pathname
          .split("/")
          .filter(Boolean)
          .map((part) => decodeURIComponent(part));

        if (parts[0] !== "api" || parts[1] !== "evals" || parts[2] !== "runs") {
          sendJson(res, 404, { error: "Not found." });
          return;
        }
        if (req.method !== "GET") {
          sendJson(res, 405, { error: "Method not allowed." });
          return;
        }

        if (parts.length === 3) {
          await handleListRuns(runsDir, res);
          return;
        }

        const runId = parts[3];
        if (!RUN_ID_PATTERN.test(runId)) {
          sendJson(res, 404, { error: "Not found." });
          return;
        }

        if (parts.length === 4) {
          await handleRunDetail(runsDir, runId, res);
          return;
        }

        if (parts[4] === "files" && parts.length > 5) {
          await handleRunFile(runsDir, runId, parts.slice(5), res);
          return;
        }

        sendJson(res, 404, { error: "Not found." });
      } catch (error) {
        sendJson(res, 400, {
          error: error instanceof Error ? error.message : "Bad request.",
        });
      }
    })();
  };
}
