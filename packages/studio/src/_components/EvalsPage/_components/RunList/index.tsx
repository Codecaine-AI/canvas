import { Badge } from "@codecaine-ai/canvas/ui/badge";
import type { EvalRunSummary } from "../../types";
import { formatDate, formatScore, statusBadgeVariant } from "../../utils";

export type RunListProps = {
  runs: EvalRunSummary[];
  runsState: "loading" | "idle" | "error";
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
};

export function RunList({ runs, runsState, selectedRunId, onSelect }: RunListProps) {
  return (
    <section
      aria-label="Eval runs"
      className="studio-evals-runs w-72 shrink-0 overflow-y-auto border-r border-border p-3"
    >
      {runsState === "loading" && runs.length === 0 ? (
        <p className="p-2 text-ui-lg text-muted-foreground">Loading runs...</p>
      ) : runsState === "error" ? (
        <p className="p-2 text-ui-lg text-destructive">
          Could not load eval runs. Is the studio server running with dev pages?
        </p>
      ) : runs.length === 0 ? (
        <p className="p-2 text-ui-lg text-muted-foreground">No eval runs yet.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {runs.map((run) => (
            <li key={run.run_id}>
              <button
                type="button"
                onClick={() => onSelect(run.run_id)}
                aria-pressed={run.run_id === selectedRunId}
                className={`w-full rounded border px-3 py-2 text-left transition-colors ${
                  run.run_id === selectedRunId
                    ? "border-border bg-muted"
                    : "border-transparent hover:bg-muted/50"
                }`}
              >
                <span className="block truncate font-mono text-ui-xs font-medium">
                  {run.run_id}
                </span>
                <span className="mt-1.5 flex items-center gap-1.5">
                  <Badge variant={statusBadgeVariant(run.status)}>{run.status}</Badge>
                  {run.mean_score !== null ? (
                    <Badge variant="secondary">mean {formatScore(run.mean_score)}</Badge>
                  ) : null}
                </span>
                <span className="mt-1 block text-ui-2xs text-muted-foreground">
                  {formatDate(run.started_at)} · {run.scenario_count} scenario
                  {run.scenario_count === 1 ? "" : "s"}
                  {run.has_scorecard ? "" : " · no scorecard"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
