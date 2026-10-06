export type AgentFetchErrorNoticeProps = { message: string };

export function AgentFetchErrorNotice({ message }: AgentFetchErrorNoticeProps) {
  return (
    <div className="rounded border border-border bg-card p-6">
      <p className="text-ui-lg font-medium">Something went wrong.</p>
      <p className="mt-1 text-ui-lg text-muted-foreground">
        The agent service answered with “{message}”. Try reloading this page.
      </p>
    </div>
  );
}
