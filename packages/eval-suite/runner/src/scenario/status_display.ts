import type {
  QueueScenarioStatus,
  SuiteQueueObserver,
  SuiteQueueStatus,
} from "./queue.ts";

const ANSI = {
  clearLine: "\u001b[2K",
  cursorUp: (lines: number): string => `\u001b[${lines}A`,
  hideCursor: "\u001b[?25l",
  showCursor: "\u001b[?25h",
};

interface StatusOutput {
  readonly isTTY?: boolean;
  write(chunk: string): unknown;
}

export interface StatusDisplayOptions {
  output?: StatusOutput;
  refreshMs?: number;
  scorecardPath: string;
  registerSignalHandlers?: boolean;
}

export interface StatusDisplayFinishOptions {
  failed?: boolean;
  interrupted?: boolean;
  scorecardPath?: string;
}

function elapsedSeconds(startedAt: string | null, endedAt: string | null): number {
  if (!startedAt) return 0;
  const start = Date.parse(startedAt);
  const end = endedAt ? Date.parse(endedAt) : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1_000));
}

export function formatElapsed(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function fit(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width);
  return `${value.slice(0, Math.max(0, width - 1))}…`;
}

function scenarioFlags(scenario: QueueScenarioStatus): string {
  return scenario.flags.length > 0 ? scenario.flags.join(", ") : "—";
}

export function formatScenarioState(
  scenario: QueueScenarioStatus,
  includeSessionWord = true,
): string {
  switch (scenario.status) {
    case "pending":
      return "queued";
    case "building": {
      const stage = scenario.currentStage ?? "stage0";
      const sessions = `(${scenario.sessionNumber}/${scenario.sessionTotal}${
        includeSessionWord ? " sessions" : ""
      })`;
      return `building ${stage} ${sessions}`;
    }
    case "sessions_done":
      return `judging (${scenario.axesDone}/${scenario.axesTotal} axes done)`;
    case "judging":
      return `judging (${scenario.axesDone}/${scenario.axesTotal} axes done)`;
    case "graded":
      return "graded";
    case "failed":
      return "failed";
    case "invalid_infra":
      return "invalid-infra";
  }
}

function scenarioElapsedAt(
  scenario: QueueScenarioStatus,
  nowMs: number,
): string {
  if (!scenario.startedAt) return "0:00";
  const start = Date.parse(scenario.startedAt);
  const end = scenario.finishedAt ? Date.parse(scenario.finishedAt) : nowMs;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "0:00";
  return formatElapsed((end - start) / 1_000);
}

export function renderStatusFrame(
  status: SuiteQueueStatus,
  nowMs = Date.now(),
): string {
  const runStart = Date.parse(status.startedAt);
  const runEnd = status.finishedAt ? Date.parse(status.finishedAt) : nowMs;
  const wall = Number.isFinite(runStart) && Number.isFinite(runEnd)
    ? formatElapsed((runEnd - runStart) / 1_000)
    : "0:00";
  const services = status.services
    .map((service) => `${service.name} ${service.up ? "up" : "down"}`)
    .join(" · ");
  const completed = status.scenarios.filter((scenario) =>
    scenario.status === "graded"
    || scenario.status === "failed"
    || scenario.status === "invalid_infra"
  ).length;
  const rows = status.scenarios.map((scenario) =>
    [
      fit(`${scenario.scenario} ${scenario.name}`, 31),
      fit(formatScenarioState(scenario), 39),
      fit(scenarioElapsedAt(scenario, nowMs), 8),
      scenarioFlags(scenario),
    ].join(" ")
  );

  return [
    `eval suite ${status.runId} · elapsed ${wall} · services ${services}`,
    `${fit("scenario", 31)} ${fit("state", 39)} ${fit("elapsed", 8)} flags`,
    ...rows,
    `judge semaphore ${status.judgeInFlight}/${status.judgeLimit} · completed ${completed}/${status.scenarios.length}`,
  ].join("\n");
}

function transitionLine(
  timestamp: string,
  scenario: QueueScenarioStatus,
): string {
  const flags = scenario.flags.length > 0
    ? ` · flags ${scenario.flags.join(", ")}`
    : "";
  return `${timestamp} ${scenario.scenario} ${
    formatScenarioState(scenario, false)
  }${flags}`;
}

export class SuiteStatusDisplay implements SuiteQueueObserver {
  readonly isTTY: boolean;

  #finished = false;
  #interval: ReturnType<typeof setInterval> | null = null;
  #lastLineCount = 0;
  #latest: SuiteQueueStatus | null = null;
  #output: StatusOutput;
  #previousTransitions = new Map<string, string>();
  #refreshMs: number;
  #scorecardPath: string;
  #signalHandlersRegistered = false;
  #startedAt = new Date().toISOString();

  constructor(options: StatusDisplayOptions) {
    this.#output = options.output ?? process.stdout;
    this.isTTY = this.#output.isTTY === true;
    this.#refreshMs = options.refreshMs ?? 1_000;
    this.#scorecardPath = options.scorecardPath;
    if (options.registerSignalHandlers !== false) this.#registerSignalHandlers();
  }

  onStatus(status: SuiteQueueStatus): void {
    if (this.#finished) return;
    this.#latest = status;
    this.#startedAt = status.startedAt;
    if (this.isTTY) {
      this.#draw();
      if (!this.#interval) {
        this.#interval = setInterval(() => this.#draw(), this.#refreshMs);
        this.#interval.unref?.();
      }
      return;
    }
    for (const scenario of status.scenarios) {
      const signature = [
        formatScenarioState(scenario, false),
        ...scenario.flags,
      ].join("\0");
      if (this.#previousTransitions.get(scenario.scenario) === signature) continue;
      this.#previousTransitions.set(scenario.scenario, signature);
      this.#output.write(`${transitionLine(status.observedAt, scenario)}\n`);
    }
  }

  finish(options: StatusDisplayFinishOptions = {}): void {
    if (this.#finished) return;
    this.#finished = true;
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
    if (this.isTTY && this.#latest) this.#draw(true);
    this.#restoreCursor();

    const latest = this.#latest;
    const graded = latest?.scenarios.filter((scenario) =>
      scenario.status === "graded"
    ).length ?? 0;
    const invalidInfra = latest?.scenarios.filter((scenario) =>
      scenario.status === "invalid_infra"
    ).length ?? 0;
    const failed = (latest?.scenarios.filter((scenario) =>
      scenario.status === "failed"
    ).length ?? 0) + invalidInfra;
    const end = latest?.finishedAt ?? new Date().toISOString();
    const wall = formatElapsed(elapsedSeconds(this.#startedAt, end));
    const qualifiers = [
      invalidInfra > 0 ? `${invalidInfra} invalid-infra` : null,
      options.interrupted ? "interrupted" : null,
      options.failed || latest?.runStatus === "failed" ? "run failed" : null,
    ].filter((value): value is string => value !== null);
    const detail = qualifiers.length > 0 ? ` (${qualifiers.join(", ")})` : "";
    this.#output.write(
      `summary: scenarios ${graded} graded / ${failed} failed${detail} · wall ${wall} · scorecard ${
        options.scorecardPath ?? this.#scorecardPath
      }\n`,
    );
    this.#removeSignalHandlers();
  }

  #draw(finishing = false): void {
    if (!this.#latest || (this.#finished && !finishing)) return;
    const frame = renderStatusFrame(this.#latest);
    const lines = frame.split("\n");
    if (this.#lastLineCount === 0) this.#output.write(ANSI.hideCursor);
    else this.#output.write(ANSI.cursorUp(this.#lastLineCount));
    this.#output.write(
      `${lines.map((line) => `${ANSI.clearLine}\r${line}`).join("\n")}\n`,
    );
    this.#lastLineCount = lines.length;
  }

  #restoreCursor(): void {
    if (!this.isTTY || this.#lastLineCount === 0) return;
    this.#output.write(ANSI.showCursor);
    this.#lastLineCount = 0;
  }

  #registerSignalHandlers(): void {
    if (this.#signalHandlersRegistered) return;
    this.#signalHandlersRegistered = true;
    process.once("exit", this.#handleExit);
    process.once("SIGINT", this.#handleSigint);
  }

  #removeSignalHandlers(): void {
    if (!this.#signalHandlersRegistered) return;
    this.#signalHandlersRegistered = false;
    process.off("exit", this.#handleExit);
    process.off("SIGINT", this.#handleSigint);
  }

  #handleExit = (): void => {
    if (!this.#finished) {
      this.#restoreCursor();
      if (this.isTTY) this.#output.write("\n");
    }
  };

  #handleSigint = (): void => {
    this.finish({ failed: true, interrupted: true });
    process.kill(process.pid, "SIGINT");
  };
}

export function createStatusDisplay(
  options: StatusDisplayOptions,
): SuiteStatusDisplay {
  return new SuiteStatusDisplay(options);
}
