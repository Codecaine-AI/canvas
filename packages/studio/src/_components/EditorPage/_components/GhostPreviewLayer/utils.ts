import type { CSSProperties } from "react";
import type { useCanvasStyle } from "@codecaine-ai/canvas";
import { boardMarkTheme, stageMarkColors } from "@codecaine-ai/canvas/style";
import { flat } from "@codecaine-ai/design-system";
import type { AgentRect } from "@codecaine-ai/canvas-agent/protocol";
import type { MarkColors } from "./types";

/** The marks' colors for one board style. Exported for its test. */
export function markColors(style: ReturnType<typeof useCanvasStyle>): MarkColors {
  const tokens = flat[boardMarkTheme(style)];
  return {
    agent: tokens["color.annotation.accent"],
    agentOn: tokens["color.text.on-solid"],
    displaced: tokens["color.blue.solid"],
    removed: tokens["color.diff.del"],
    removedOn: tokens["color.text.on-solid"],
    surface: stageMarkColors(style).surface,
  };
}

export function parseViewBox(svg: string): AgentRect | null {
  const match = svg.match(
    /\bviewBox\s*=\s*["']\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)[,\s]+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)[,\s]+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)[,\s]+([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*["']/i,
  );
  if (!match) return null;

  const [x, y, width, height] = match.slice(1).map(Number);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return null;
  }
  return { x, y, width, height };
}

export function rectStyle(rect: AgentRect): CSSProperties {
  return {
    position: "absolute",
    left: `${rect.x}px`,
    top: `${rect.y}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
    boxSizing: "border-box",
    pointerEvents: "none",
  };
}
