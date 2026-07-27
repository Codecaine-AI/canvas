/**
 * The four entity-kind spec modules of the <capabilities> block, one file
 * per kind, each structured as description → functionality (topics with
 * points and subpoints) → tips (see ./spec.ts). ../index.ts assembles them
 * with the op declarations and generated rosters.
 */
export type { KindSpec, SpecItem, SpecPoint, SpecTopic } from "./spec";
export { SECTIONS_SPEC } from "./sections";
export { STICKIES_SPEC } from "./stickies";
export { OBJECTS_SPEC } from "./objects";
export { CONNECTIONS_SPEC } from "./connections";
