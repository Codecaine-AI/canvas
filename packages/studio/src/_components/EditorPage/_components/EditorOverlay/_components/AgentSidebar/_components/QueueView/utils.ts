export function runLabel(noteCount: number): string {
  if (noteCount === 0) return "Ask";
  return `Apply ${noteCount} ${noteCount === 1 ? "note" : "notes"}`;
}
