/**
 * Registration surface for the layout editor's thirteen mutation tools. The
 * four kind modules define their state checks and mutations; this module
 * exposes the structural runtime contract every descriptor satisfies.
 *
 * The ordered collection keeps kind groups together and places fit_section
 * last, while the name index provides direct lookup for agent catalog
 * registration.
 */
import type { TSchema } from "@mariozechner/pi-ai";

import type { LayoutToolRenderResult } from "../../tool-runtime";
import type { OperationHost } from "../operation-tool";
import {
  addConnection,
  removeConnection,
  updateConnection,
} from "./connections";
import {
  addObject,
  removeObject,
  updateObject,
} from "./objects";
import {
  addSection,
  fitSection,
  removeSection,
  updateSection,
} from "./sections";
import {
  addSticky,
  removeSticky,
  updateSticky,
} from "./stickies";

export interface OperationTool {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly executionMode: "sequential";
  readonly parameters: TSchema;
  execute(
    params: Record<string, unknown>,
    ctx: OperationHost,
  ): LayoutToolRenderResult;
}

export {
  addConnection,
  addObject,
  addSection,
  addSticky,
  fitSection,
  removeConnection,
  removeObject,
  removeSection,
  removeSticky,
  updateConnection,
  updateObject,
  updateSection,
  updateSticky,
};

export const operationTools: readonly OperationTool[] = [
  addSection,
  updateSection,
  removeSection,
  addSticky,
  updateSticky,
  removeSticky,
  addObject,
  updateObject,
  removeObject,
  addConnection,
  updateConnection,
  removeConnection,
  fitSection,
];

const operationToolsByName = new Map(
  operationTools.map((tool) => [tool.name, tool]),
);

export function findOperationTool(name: string): OperationTool | undefined {
  return operationToolsByName.get(name);
}
