/**
 * The trial run: before the drawer sees a finding, the runner applies each
 * call a reviewer proposed to a copy of the board, with the tool code the
 * drawer uses, and measures what it did. Ford: "So we can, like, do some
 * heavy lifting where it's like, hey, like, here is what I think should be
 * done."
 */
import type { ReviewCanvas } from "./critic.ts";
import type { FindingAdvice, ProposedCall } from "./review-types.ts";

/**
 * Trials every call of `findings` on copies of the board at `boardPath`,
 * which it never writes. Writes its record and images into `outDir`. Returns
 * one advice per finding that has a call.
 */
export async function trialFindings(_options: {
  canvas: ReviewCanvas;
  boardPath: string;
  outDir: string;
  findings: Array<{ id: string; calls: ProposedCall[] }>;
}): Promise<FindingAdvice[]> {
  throw new Error("The trial run is not built yet");
}
