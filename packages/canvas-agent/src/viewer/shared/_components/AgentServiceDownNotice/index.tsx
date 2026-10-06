export type AgentServiceDownNoticeProps = { subject: string };

/** Shared calm empty state for when the harness process is not up. */
export function AgentServiceDownNotice({ subject }: AgentServiceDownNoticeProps) {
  return (
    <div className="rounded border border-border bg-card p-6">
      <p className="text-ui-lg font-medium">The agent service is not running.</p>
      <p className="mt-1 text-ui-lg text-muted-foreground">
        {subject} will appear here once the agent service is up on port 4820.
        Nothing is broken — the viewer just could not reach it.
      </p>
    </div>
  );
}
