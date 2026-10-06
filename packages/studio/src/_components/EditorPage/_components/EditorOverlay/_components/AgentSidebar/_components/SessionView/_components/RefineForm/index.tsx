import type { FormEvent } from "react";
import { Button } from "@codecaine-ai/canvas/ui/button";
import { Input } from "@codecaine-ai/canvas/ui/input";

export type RefineFormProps = {
  /** SessionView keeps the draft so it survives the action panel unmounting. */
  refinement: string;
  setRefinement(refinement: string): void;
  canReview: boolean;
  onRefine(instruction: string): void | Promise<void>;
};

export function RefineForm({
  refinement,
  setRefinement,
  canReview,
  onRefine,
}: RefineFormProps) {
  const submitRefinement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const instruction = refinement.trim();
    if (!instruction || !canReview) return;
    setRefinement("");
    void onRefine(instruction);
  };

  return (
    <form className="flex gap-2" onSubmit={submitRefinement}>
      <Input
        value={refinement}
        aria-label="Refine the proposal"
        placeholder="Refine…"
        disabled={!canReview}
        onChange={(event) => setRefinement(event.target.value)}
      />
      <Button type="submit" size="sm" variant="outline" disabled={!canReview || !refinement.trim()}>
        Send
      </Button>
    </form>
  );
}
