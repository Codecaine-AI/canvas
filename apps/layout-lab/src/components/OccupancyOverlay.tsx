import { buildCompileOccupancy, occupancyGridToAscii } from "../agent/occupancy";
import type { CompileResult } from "../agent/types";

type OccupancyOverlayProps = {
  result: CompileResult | null;
  visible: boolean;
};

export function OccupancyOverlay({ result, visible }: OccupancyOverlayProps) {
  if (!visible || !result?.canvas) return null;
  const occupancy = buildCompileOccupancy(result);
  return (
    <pre className="occupancy" aria-label="Coarse occupancy map">
      {occupancyGridToAscii(occupancy)}
    </pre>
  );
}
