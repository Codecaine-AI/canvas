import type { CanvasStyleControl } from "@codecaine-ai/canvas/style";
import type { CanvasStyleTokenValue } from "@/shared/useCanvasStyleSettings";

export type RowProps = {
  control: CanvasStyleControl;
  value: CanvasStyleTokenValue;
  overridden: boolean;
  onChange(value: CanvasStyleTokenValue): void;
  onReset(): void;
};
