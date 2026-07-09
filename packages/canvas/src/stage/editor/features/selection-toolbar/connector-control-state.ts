"use client";

import type { SelectionToolbarActionId, ToolbarControlState } from "./SelectionToolbar";
import type {
  CanvasArrowDirection,
  CanvasConnectionStyle,
  InteractiveCanvasConnection,
} from "../../../../state/schema";

const DEFAULT_CONNECTOR_STYLE: CanvasConnectionStyle = "solid";
const DEFAULT_CONNECTOR_ARROW: CanvasArrowDirection = "forward";

function commonConnectorValue<T extends string>(
  connections: readonly InteractiveCanvasConnection[],
  read: (connection: InteractiveCanvasConnection) => T | undefined,
  fallback: T,
): T {
  let common: T | undefined;
  for (const connection of connections) {
    const value = read(connection) ?? fallback;
    if (common === undefined) {
      common = value;
      continue;
    }
    if (common !== value) return fallback;
  }
  return common ?? fallback;
}

export function resolveConnectorControlState(
  connections: readonly InteractiveCanvasConnection[],
): Partial<Record<SelectionToolbarActionId, ToolbarControlState>> {
  return {
    dash: {
      variant: commonConnectorValue(connections, (connection) => connection.style, DEFAULT_CONNECTOR_STYLE),
    },
    arrowhead: {
      variant: commonConnectorValue(connections, (connection) => connection.arrow, DEFAULT_CONNECTOR_ARROW),
    },
  };
}
