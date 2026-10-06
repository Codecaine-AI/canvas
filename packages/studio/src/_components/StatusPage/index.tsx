import { Button } from "@codecaine-ai/canvas/ui/button";
import { navigate } from "@/shared/navigation";

export type StatusPageProps = { message: string; showBack?: boolean };

/** A board route's loading, not-found and error page, outside the shell. */
export function StatusPage({ message, showBack = true }: StatusPageProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <p className="text-ui-lg text-muted-foreground">{message}</p>
        {showBack ? (
          <Button type="button" variant="outline" onClick={() => navigate("/")}>
            Back to boards
          </Button>
        ) : null}
      </div>
    </div>
  );
}
