import { useState } from "react";
import { Badge } from "@codecaine-ai/canvas/ui/badge";
import type { EvalRunDetail, Lightbox, ScorecardScenario } from "@/_components/EvalsPage/types";
import { formatScore, runFileUrl, statusBadgeVariant } from "@/_components/EvalsPage/utils";

export type ScenarioCardProps = {
  detail: EvalRunDetail;
  scenarioId: string;
  axisOrder: string[];
  scorecardScenario: ScorecardScenario | null;
  onOpenLightbox: (lightbox: Lightbox) => void;
};

export function ScenarioCard({
  detail,
  scenarioId,
  axisOrder,
  scorecardScenario,
  onOpenLightbox,
}: ScenarioCardProps) {
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
    <article className="flex flex-col overflow-hidden rounded border border-border bg-card">
      <div className="flex items-start justify-between gap-3 px-4 pt-3">
        <div className="min-w-0">
          <h3 className="truncate text-ui-lg font-semibold text-ink">{label}</h3>
          {isLiveRun && progressScenario ? (
            <p className="mt-0.5 truncate font-mono text-ui-2xs text-muted-foreground">
              {progressScenario.status}
              {progressScenario.stages_done?.length
                ? ` · done: ${progressScenario.stages_done.join(", ")}`
                : ""}
            </p>
          ) : null}
        </div>
        <Badge variant={statusBadgeVariant(status)}>{status}</Badge>
      </div>

      <div className="mt-3 aspect-16/10 w-full border-y border-border bg-[color:var(--studio-board-background,var(--ds-color-surface-sunken))]">
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
          <div className="flex h-full items-center justify-center text-ui-xs text-muted-foreground">
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
                className={`rounded border px-2 py-0.5 font-mono text-ui-2xs transition-colors ${
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
            {/* A flag is free text (a judge's skip reason runs a sentence long):
                let it wrap inside the card, where a nowrap badge would clip. */}
            {scenarioFlags.map((flag) => (
              <Badge key={flag} variant="destructive" className="max-w-full whitespace-normal">
                {flag}
              </Badge>
            ))}
          </div>
        ) : null}

        {livePreviewUrl ? (
          <a
            className="text-ui-xs underline underline-offset-2 hover:text-foreground"
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
