import type { EvalRunDetail } from "./types";

export function runFileUrl(runId: string, ...segments: string[]): string {
  const path = segments.map(encodeURIComponent).join("/");
  return `/api/evals/runs/${encodeURIComponent(runId)}/files/${path}`;
}

export function formatScore(score: number | null | undefined): string {
  if (typeof score !== "number") return "—";
  return String(Number(score.toFixed(2)));
}

export function formatDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

export function statusBadgeVariant(
  status: string,
): "default" | "outline" | "destructive" | "ghost" {
  if (status === "running" || status === "building") return "default";
  if (status === "completed" || status === "graded") return "outline";
  if (status === "failed") return "destructive";
  return "ghost";
}

/** Fingerprint one-liner: scorecard fields first, fingerprint.md fallback. */
export function fingerprintSummary(detail: EvalRunDetail): string | null {
  const fingerprint = detail.scorecard?.fingerprint;
  if (fingerprint) {
    return Object.entries(fingerprint)
      .map(([key, value]) => `${key} ${value}`)
      .join(" · ");
  }
  const md = detail.fingerprint_md;
  if (!md) return null;
  const git = md.match(/- git: `([^`]+)`/)?.[1];
  const model = md.match(/model `([^`]+)`/)?.[1];
  const parts = [git ? `repo ${git}` : null, model ? `model ${model}` : null];
  const summary = parts.filter(Boolean).join(" · ");
  return summary || null;
}
