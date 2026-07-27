import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@codecaine-ai/canvas/ui/badge";
import { Button } from "@codecaine-ai/canvas/ui/button";
import {
  ArrowLeftIcon,
  CheckIcon,
  RotateCcwIcon,
} from "@codecaine-ai/canvas/ui/icons";

/**
 * The Evals gallery (dev-pages flag only): browse the eval-suite's historical
 * run artifacts through the studio server's /api/evals surface — a run rail
 * on the left, per-scenario stage-render cards with judge scores on the
 * right. Read-only over whatever the runner has written so far, so an
 * in-flight run just shows its partial state and is re-polled while running.
 */

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

type ScorecardScenario = {
  id: string;
  label?: string;
  status?: string;
  scores?: Record<string, number | null>;
  flags?: string[];
};

type Scorecard = {
  status?: string;
  fingerprint?: Record<string, string>;
  sessions?: Record<string, number>;
  axes?: { code: string; order: number }[];
  scenarios?: ScorecardScenario[];
  means?: { scores?: Record<string, number | null>; flags?: string[] };
};

type RunProgressScenario = {
  status?: string;
  stages_done?: string[];
};

type RunProgress = {
  status?: string;
  started_at?: string | null;
  finished_at?: string | null;
  scenarios?: Record<string, RunProgressScenario>;
};

type EvalRunDetail = {
  run_id: string;
  status: string;
  progress: RunProgress | null;
  scorecard: Scorecard | null;
  fingerprint_md: string | null;
  scenarios: EvalScenarioManifest[];
  live: { available: boolean; origin: string } | null;
};

type Lightbox = { src: string; caption: string };

function runFileUrl(runId: string, ...segments: string[]): string {
  const path = segments.map(encodeURIComponent).join("/");
  return `/api/evals/runs/${encodeURIComponent(runId)}/files/${path}`;
}

function formatScore(score: number | null | undefined): string {
  if (typeof score !== "number") return "—";
  return String(Number(score.toFixed(2)));
}

function formatDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

function statusBadgeVariant(
  status: string,
): "default" | "outline" | "destructive" | "ghost" {
  if (status === "running" || status === "building") return "default";
  if (status === "completed" || status === "graded") return "outline";
  if (status === "failed") return "destructive";
  return "ghost";
}

async function fetchJson<T>(input: RequestInfo): Promise<T> {
  const response = await fetch(input);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

/** Fingerprint one-liner: scorecard fields first, fingerprint.md fallback. */
function fingerprintSummary(detail: EvalRunDetail): string | null {
  const fingerprint = detail.scorecard?.fingerprint;
  if (fingerprint) {
    return Object.entries(fingerprint)
      .map(([key, value]) => `${key} ${value}`)
      .join(" · ");
  }
  const md = detail.fingerprint_md;
  if (!md) return null;
  const git = md.match(/- git: `([^`]+)`/)?.[1];
  const model = md.match(/model `([^`]+)`/)?.[1];
  const parts = [git ? `repo ${git}` : null, model ? `model ${model}` : null];
  const summary = parts.filter(Boolean).join(" · ");
  return summary || null;
}

export function EvalsPage({ onBack }: { onBack: () => void }) {
  const [runs, setRuns] = useState<EvalRunSummary[]>([]);
  const [runsState, setRunsState] = useState<"loading" | "idle" | "error">("loading");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EvalRunDetail | null>(null);
  const [detailState, setDetailState] = useState<"loading" | "idle" | "error">("idle");
  const [lightbox, setLightbox] = useState<Lightbox | null>(null);

  const loadRuns = useCallback(async () => {
    setRunsState("loading");
    try {
      const result = await fetchJson<{ runs: EvalRunSummary[] }>("/api/evals/runs");
      setRuns(result.runs);
      setRunsState("idle");
    } catch {
      setRunsState("error");
    }
  }, []);

  const loadDetail = useCallback(async (runId: string, options?: { silent?: boolean }) => {
    if (!options?.silent) setDetailState("loading");
    try {
      const result = await fetchJson<EvalRunDetail>(
        `/api/evals/runs/${encodeURIComponent(runId)}`,
      );
      setDetail(result);
      setDetailState("idle");
    } catch {
      if (!options?.silent) {
        setDetail(null);
        setDetailState("error");
      }
    }
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  useEffect(() => {
    if (!selectedRunId && runs.length > 0) setSelectedRunId(runs[0].run_id);
  }, [runs, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) return;
    setDetail(null);
    void loadDetail(selectedRunId);
  }, [loadDetail, selectedRunId]);

  // Light polling while the selected run is still executing.
  useEffect(() => {
    if (!selectedRunId || detail?.status !== "running") return;
    const timer = window.setInterval(() => {
      void loadDetail(selectedRunId, { silent: true });
    }, 5000);
    return () => window.clearInterval(timer);
  }, [detail?.status, loadDetail, selectedRunId]);

  useEffect(() => {
    if (!lightbox) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lightbox]);

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <CheckIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">Evals</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Historical eval-suite runs from packages/eval-suite/runs
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              void loadRuns();
              if (selectedRunId) void loadDetail(selectedRunId);
            }}
          >
            <RotateCcwIcon className="h-4 w-4" />
            Refresh
          </Button>
          <Button type="button" variant="outline" onClick={onBack}>
            <ArrowLeftIcon className="h-4 w-4" />
            Back to boards
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 overflow-y-auto border-r border-border p-3">
          {runsState === "loading" && runs.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">Loading runs...</p>
          ) : runsState === "error" ? (
            <p className="p-2 text-sm text-destructive">
              Could not load eval runs. Is the studio server running with dev pages?
            </p>
          ) : runs.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">No eval runs yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {runs.map((run) => (
                <li key={run.run_id}>
                  <button
                    type="button"
                    onClick={() => setSelectedRunId(run.run_id)}
                    aria-pressed={run.run_id === selectedRunId}
                    className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                      run.run_id === selectedRunId
                        ? "border-border bg-muted"
                        : "border-transparent hover:bg-muted/50"
                    }`}
                  >
                    <span className="block truncate font-mono text-xs font-medium">
                      {run.run_id}
                    </span>
                    <span className="mt-1.5 flex items-center gap-1.5">
                      <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                      {run.mean_score !== null ? (
                        <Badge variant="secondary">mean {formatScore(run.mean_score)}</Badge>
                      ) : null}
                    </span>
                    <span className="mt-1 block text-[11px] text-muted-foreground">
                      {formatDate(run.started_at)} · {run.scenario_count} scenario
                      {run.scenario_count === 1 ? "" : "s"}
                      {run.has_scorecard ? "" : " · no scorecard"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto p-6">
          {!selectedRunId ? (
            <p className="text-sm text-muted-foreground">Select a run.</p>
          ) : detailState === "loading" && !detail ? (
            <p className="text-sm text-muted-foreground">Loading run...</p>
          ) : detailState === "error" || !detail ? (
            <p className="text-sm text-destructive">Could not load this run.</p>
          ) : (
            <RunDetail detail={detail} onOpenLightbox={setLightbox} />
          )}
        </main>
      </div>

      {lightbox ? (
        <div
          role="button"
          aria-label="Close full-size render"
          className="fixed inset-0 z-50 flex cursor-zoom-out flex-col items-center justify-center gap-3 bg-black/85 p-8"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox.src}
            alt={lightbox.caption}
            className="min-h-0 max-w-full flex-1 object-contain"
          />
          <span className="font-mono text-xs text-white/80">{lightbox.caption}</span>
        </div>
      ) : null}
    </div>
  );
}

function RunDetail({
  detail,
  onOpenLightbox,
}: {
  detail: EvalRunDetail;
  onOpenLightbox: (lightbox: Lightbox) => void;
}) {
  const scorecard = detail.scorecard;
  const fingerprint = fingerprintSummary(detail);
  const sessions = scorecard?.sessions;
  const runFlags = scorecard?.means?.flags ?? [];
  const axisOrder = useMemo(
    () =>
      (scorecard?.axes ?? [])
        .slice()
        .sort((a, b) => a.order - b.order)
        .map(({ code }) => code),
    [scorecard],
  );

  const scorecardById = useMemo(() => {
    const map = new Map<string, ScorecardScenario>();
    for (const scenario of scorecard?.scenarios ?? []) map.set(scenario.id, scenario);
    return map;
  }, [scorecard]);

  // Scenario directories on disk first, then scorecard-only rows (a scenario
  // the scorecard tracks but the runner never got to write).
  const scenarioIds = useMemo(() => {
    const ids = detail.scenarios.map(({ scenario }) => scenario);
    const seen = new Set(ids);
    for (const scenario of scorecard?.scenarios ?? []) {
      if (!seen.has(scenario.id)) ids.push(scenario.id);
    }
    return ids;
  }, [detail.scenarios, scorecard]);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2 rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-sm font-semibold">{detail.run_id}</h2>
          <Badge variant={statusBadgeVariant(detail.status)}>{detail.status}</Badge>
          {runFlags.map((flag) => (
            <Badge key={flag} variant="destructive">{flag}</Badge>
          ))}
          {detail.live ? (
            <Badge variant={detail.live.available ? "secondary" : "ghost"}>
              {detail.live.available ? "live boards up" : "live boards down"}
            </Badge>
          ) : null}
        </div>
        {fingerprint ? (
          <p className="font-mono text-xs text-muted-foreground">{fingerprint}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {sessions ? (
            <span>
              sessions: {sessions.ok ?? 0} ok / {sessions.rejected ?? 0} rejected /{" "}
              {sessions.abandoned ?? 0} abandoned / {sessions.invalidInfra ?? 0} infra
            </span>
          ) : null}
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href={runFileUrl(detail.run_id, "fingerprint.md")}
            target="_blank"
            rel="noreferrer"
          >
            fingerprint.md
          </a>
          <a
            className="underline underline-offset-2 hover:text-foreground"
            href={runFileUrl(detail.run_id, "scorecard.md")}
            target="_blank"
            rel="noreferrer"
          >
            scorecard.md
          </a>
        </div>
      </section>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))" }}
      >
        {scenarioIds.map((scenarioId) => (
          <ScenarioCard
            key={`${detail.run_id}:${scenarioId}`}
            detail={detail}
            scenarioId={scenarioId}
            axisOrder={axisOrder}
            scorecardScenario={scorecardById.get(scenarioId) ?? null}
            onOpenLightbox={onOpenLightbox}
          />
        ))}
      </div>
    </div>
  );
}

function ScenarioCard({
  detail,
  scenarioId,
  axisOrder,
  scorecardScenario,
  onOpenLightbox,
}: {
  detail: EvalRunDetail;
  scenarioId: string;
  axisOrder: string[];
  scorecardScenario: ScorecardScenario | null;
  onOpenLightbox: (lightbox: Lightbox) => void;
}) {
  const manifest = detail.scenarios.find(({ scenario }) => scenario === scenarioId);
  const progressScenario = detail.progress?.scenarios?.[scenarioId];
  const [pickedStage, setPickedStage] = useState<string | null>(null);

  const stages = manifest?.stages ?? [];
  const lastRenderedStage = [...stages].reverse().find(({ png }) => png)?.name ?? null;
  const shownStage =
    pickedStage && stages.some(({ name, png }) => name === pickedStage && png)
      ? pickedStage
      : lastRenderedStage;

  const judgesByAxis = new Map(
    (manifest?.judges ?? []).map((judge) => [judge.axis.toUpperCase(), judge]),
  );
  const axes =
    axisOrder.length > 0 ? axisOrder : [...judgesByAxis.keys()].sort();
  const judgeFlags = (manifest?.judges ?? []).flatMap(({ axis, flags }) =>
    flags.map((flag) => `${axis.toUpperCase()}:${flag}`),
  );
  const scenarioFlags = [...(scorecardScenario?.flags ?? []), ...judgeFlags];

  const status =
    scorecardScenario?.status ?? progressScenario?.status ?? "unknown";
  const label = scorecardScenario?.label ?? scenarioId;
  const isLiveRun = detail.status === "running";
  const livePreviewUrl = detail.live?.available
    ? `${detail.live.origin}/api/canvases/eval.${detail.run_id}.${scenarioId}/preview.svg?fit=content&pad=48`
    : null;

  const imageSrc = shownStage
    ? runFileUrl(detail.run_id, scenarioId, `${shownStage}.png`)
    : null;

  return (
    <article className="flex flex-col overflow-hidden rounded-md border border-border bg-card">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{label}</h3>
          {isLiveRun && progressScenario ? (
            <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
              {progressScenario.status}
              {progressScenario.stages_done?.length
                ? ` · done: ${progressScenario.stages_done.join(", ")}`
                : ""}
            </p>
          ) : null}
        </div>
        <Badge variant={statusBadgeVariant(status)}>{status}</Badge>
      </div>

      <div className="mt-3 aspect-[16/10] w-full border-y border-border bg-[#F5F5F5]">
        {imageSrc && shownStage ? (
          <img
            src={imageSrc}
            alt={`${scenarioId} ${shownStage} render`}
            loading="lazy"
            draggable={false}
            className="h-full w-full cursor-zoom-in object-contain"
            onClick={() =>
              onOpenLightbox({
                src: imageSrc,
                caption: `${detail.run_id} · ${scenarioId} · ${shownStage}`,
              })
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No renders yet
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        {stages.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {stages.map((stage) => (
              <button
                key={stage.name}
                type="button"
                disabled={!stage.png}
                aria-pressed={stage.name === shownStage}
                title={stage.png ? `Show ${stage.name}` : `${stage.name}: no render`}
                onClick={() => setPickedStage(stage.name)}
                className={`rounded-md border px-2 py-0.5 font-mono text-[11px] transition-colors ${
                  stage.name === shownStage
                    ? "border-transparent bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                } disabled:cursor-not-allowed disabled:opacity-40`}
              >
                {stage.name}
              </button>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1">
          {axes.map((axis) => {
            const score =
              scorecardScenario?.scores?.[axis] ?? judgesByAxis.get(axis)?.score ?? null;
            return (
              <Badge key={axis} variant={score === null ? "ghost" : "outline"}>
                {axis} {formatScore(score)}
              </Badge>
            );
          })}
        </div>

        {scenarioFlags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {scenarioFlags.map((flag) => (
              <Badge key={flag} variant="destructive">{flag}</Badge>
            ))}
          </div>
        ) : null}

        {livePreviewUrl ? (
          <a
            className="text-xs underline underline-offset-2 hover:text-foreground"
            href={livePreviewUrl}
            target="_blank"
            rel="noreferrer"
          >
            Live board preview
          </a>
        ) : null}
      </div>
    </article>
  );
}
