"use client";

/**
 * Section nesting depth for the live stage. CanvasStage computes the
 * document's depth map once (state/section-depth.ts sectionDepthMap) and
 * hands each section its depth through ObjectRenderProps.sectionDepth; it also
 * provides the map here so overlays rendered inside the stage — the in-place
 * section title editor — resolve the same layer-cake paint
 * (theme/palette.ts resolveSectionPaint) as the chip they stand in for.
 */

import { createContext, useContext, type ReactNode } from "react";

import type { CanvasColor } from "../../state/schema";

const SectionDepthContext = createContext<ReadonlyMap<string, number> | null>(null);

export function SectionDepthProvider({
  depths,
  children,
}: {
  depths: ReadonlyMap<string, number>;
  children?: ReactNode;
}) {
  return <SectionDepthContext.Provider value={depths}>{children}</SectionDepthContext.Provider>;
}

/** Nesting depth of `sectionId` (1 = top-level) — 1 outside a stage or for an unknown id. */
export function useSectionDepth(sectionId: string): number {
  return useContext(SectionDepthContext)?.get(sectionId) ?? 1;
}

const SectionContainerColorContext = createContext<ReadonlyMap<string, CanvasColor> | null>(null);

/**
 * Each object's nearest section color (state/section-depth.ts
 * sectionContainerColorMap), for node and tile paint on the live stage.
 */
export function SectionContainerColorProvider({
  containers,
  children,
}: {
  containers: ReadonlyMap<string, CanvasColor>;
  children?: ReactNode;
}) {
  return <SectionContainerColorContext.Provider value={containers}>{children}</SectionContainerColorContext.Provider>;
}

/** The color of the section `objectId` sits in — null outside a stage or outside every section. */
export function useContainerColor(objectId: string): CanvasColor | null {
  return useContext(SectionContainerColorContext)?.get(objectId) ?? null;
}
