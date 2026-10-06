import { useMemo } from "react";
import { Badge } from "@codecaine-ai/canvas/ui/badge";
import type { EvalRunDetail, Lightbox, ScorecardScenario } from "../../types";
import { fingerprintSummary, runFileUrl, statusBadgeVariant } from "../../utils";
import { ScenarioCard } from "./_components/ScenarioCard";

export type RunDetailProps = {
  detail: EvalRunDetail;
  onOpenLightbox: (lightbox: Lightbox) => void;
};

export function RunDetail({ detail, onOpenLightbox }: RunDetailProps) {
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
      <section className="flex flex-col gap-2 rounded border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-ui-lg font-semibold text-ink">{detail.run_id}</h2>
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
          <p className="font-mono text-ui-xs text-muted-foreground">{fingerprint}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-ui-xs text-muted-foreground">
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
        // A track never wider than the pane, so a narrow window does not scroll sideways.
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(340px, 100%), 1fr))" }}
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
