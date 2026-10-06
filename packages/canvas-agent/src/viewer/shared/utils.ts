/** A plain object (not null, not an array): the pages' and the transcript's shape checks. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
