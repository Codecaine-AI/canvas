import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import "./styles.css";
import { fetchJson } from "./api";
import type { EvalRunDetail, EvalRunSummary, Lightbox as LightboxTarget } from "./types";
import { Lightbox } from "./_components/Lightbox";
import { RunDetail } from "./_components/RunDetail";
import { RunList } from "./_components/RunList";

export type EvalsPageProps = {
  /** Bumped by the shell topbar's Refresh button: reload the runs and the selected run. */
  refreshSignal?: number;
  /** The workspace theme's board color, painted behind (letterboxing) each render. */
  boardBackground?: string;
};

/**
 * The Evals gallery (dev-pages flag only): browse the eval-suite's historical
 * run artifacts through the studio server's /api/evals surface — a run rail
 * on the left, per-scenario stage-render cards with judge scores on the
 * right. Read-only over whatever the runner has written so far, so an
 * in-flight run just shows its partial state and is re-polled while running.
 */
export function EvalsPage({ refreshSignal = 0, boardBackground }: EvalsPageProps) {
  const [runs, setRuns] = useState<EvalRunSummary[]>([]);
  const [runsState, setRunsState] = useState<"loading" | "idle" | "error">("loading");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EvalRunDetail | null>(null);
  const [detailState, setDetailState] = useState<"loading" | "idle" | "error">("idle");
  const [lightbox, setLightbox] = useState<LightboxTarget | null>(null);

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

  // Refresh from the topbar. The signal outlives this page (App holds it), so
  // only a change after mount reloads; the mount load is the effect above.
  const handledRefreshSignal = useRef(refreshSignal);
  useEffect(() => {
    if (refreshSignal === handledRefreshSignal.current) return;
    handledRefreshSignal.current = refreshSignal;
    void loadRuns();
    if (selectedRunId) void loadDetail(selectedRunId);
  }, [loadDetail, loadRuns, refreshSignal, selectedRunId]);

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
    // A tool view on the shell's full lane (styles.css, .studio-evals): the run
    // list and the run detail fill the space under the topbar and scroll on
    // their own, as before the shell.
    <div
      className="studio-evals flex flex-col"
      style={boardBackground ? ({ "--studio-board-background": boardBackground } as CSSProperties) : undefined}
    >
      <div className="studio-evals-panes flex min-h-0 flex-1">
        <RunList
          runs={runs}
          runsState={runsState}
          selectedRunId={selectedRunId}
          onSelect={setSelectedRunId}
        />

        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <p className="mb-5 text-ui-lg text-muted-foreground">
            Historical eval-suite runs from packages/eval-suite/runs
          </p>
          {!selectedRunId ? (
            <p className="text-ui-lg text-muted-foreground">Select a run.</p>
          ) : detailState === "loading" && !detail ? (
            <p className="text-ui-lg text-muted-foreground">Loading run...</p>
          ) : detailState === "error" || !detail ? (
            <p className="text-ui-lg text-destructive">Could not load this run.</p>
          ) : (
            <RunDetail detail={detail} onOpenLightbox={setLightbox} />
          )}
        </div>
      </div>

      {lightbox ? <Lightbox lightbox={lightbox} onClose={() => setLightbox(null)} /> : null}
    </div>
  );
}
