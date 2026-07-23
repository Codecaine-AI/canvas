import { useMemo } from "react";
import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas";
import type { AgentProposal } from "@codecaine-ai/canvas-agent/protocol";
import { Badge } from "@codecaine-ai/canvas/ui/badge";
import { ChevronDownIcon } from "@codecaine-ai/canvas/ui/icons";
import { classifyChanges } from "./classify-changes";

export interface DeltaCardProps {
  baselineDocument: InteractiveCanvasDocument;
  proposal: AgentProposal;
}

function lintWarnings(lint: string): string[] {
  const lines = lint
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (
    lines.length === 0 ||
    lines.every((line) => /^(lint:\s*)?(clean\.?|no warnings\.?|none\.?)$/i.test(line))
  ) {
    return [];
  }

  return lines
    .filter((line) => !/^lint:\s*$/i.test(line))
    .map((line) => line.replace(/^[-*]\s*/, ""));
}

function changeChip(label: string, count: number) {
  if (count === 0) return null;
  return (
    <Badge key={label} variant="outline" className="normal-case tracking-normal">
      {label} {count}
    </Badge>
  );
}

export function DeltaCard({ baselineDocument, proposal }: DeltaCardProps) {
  const changes = useMemo(
    () => classifyChanges(baselineDocument, proposal.operations),
    [baselineDocument, proposal.operations],
  );
  const warnings = useMemo(() => lintWarnings(proposal.lint), [proposal.lint]);
  const resized = changes.moved.filter((change) => change.resized).length;
  const removed = changes.removed.length + changes.removedConnections.length;

  return (
    <section className="rounded-md border border-border/70 bg-card/70 p-3 shadow-sm">
      <h2 className="text-xs font-semibold">Proposed changes</h2>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {changeChip("Moved", changes.moved.length)}
        {changeChip("Created", changes.created.length)}
        {changeChip("Removed", removed)}
        {changeChip("Resized", resized)}
        {changes.moved.length === 0 &&
        changes.created.length === 0 &&
        removed === 0 ? (
          <Badge variant="outline" className="normal-case tracking-normal">
            No object changes
          </Badge>
        ) : null}
      </div>

      <p className="mt-3 whitespace-pre-wrap text-xs leading-relaxed text-foreground/90">
        {proposal.delta.trim() || "No changes."}
      </p>

      {warnings.length > 0 ? (
        <details className="group mt-3 border-t border-border/70 pt-2">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
            <ChevronDownIcon className="h-3 w-3 transition-transform group-open:rotate-180" />
            {warnings.length} layout {warnings.length === 1 ? "warning" : "warnings"}
          </summary>
          <ul className="mt-2 space-y-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
            {warnings.map((warning, index) => (
              <li key={`${index}-${warning}`} className="list-disc break-words">
                {warning}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
