/**
 * A minimal client for Jev, TypeSafe AI's System One model
 * (`POST https://api.typesafe.ai/v1/systemone`), for Choice questions only.
 *
 * The same pattern as the budget app's adapter: Bearer TYPESAFE_API_KEY, a
 * shared request-start limiter, up to four attempts with exponential backoff
 * on network errors and on 429 / 5xx / 529 (honoring `retry-after`), and a
 * strict check of every answer before the caller reads it. `fetch` and
 * `sleep` are injectable so tests never touch the network or the clock.
 * The key is passed in by the caller; this module never reads the
 * environment and never prints the key.
 */

export const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";

/** A Choice answer: the chosen option, the distribution over every option, and its confidence. */
export interface JevChoice {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

/** Instructions and option descriptions may be a string or structured JSON (TypeSafe "structured rubric"). */
export type JevText = string | Record<string, unknown> | unknown[];

export interface JevChoiceQuestion {
  type: "choice";
  instructions: JevText;
  criteria: Record<string, JevText | null>;
}

export interface JevRequest {
  model: string;
  state: unknown;
  questions: Record<string, JevChoiceQuestion>;
}

export interface JevUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface JevResponse {
  model: string;
  answers: Record<string, JevChoice>;
  usage: JevUsage;
}

const isProbability = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;

const isCount = (x: unknown): x is number => Number.isSafeInteger(x) && (x as number) >= 0;

/**
 * Parse a response body against the request it answers: one Choice answer per
 * question, each choice one of that question's options, and probabilities that
 * cover every option, sum to 1, and peak at the chosen option. Throws on any
 * mismatch, so the caller never acts on a malformed answer.
 */
export function validateJevResponse(value: unknown, request: JevRequest): JevResponse {
  const response = value as JevResponse;
  if (
    !response || typeof response.model !== "string" || response.model === ""
    || !response.answers || typeof response.answers !== "object"
    || !response.usage || !isCount(response.usage.input_tokens) || !isCount(response.usage.output_tokens)
    || Object.keys(response.answers).length !== Object.keys(request.questions).length
  ) {
    throw new Error("invalid Jev response envelope");
  }
  for (const [id, question] of Object.entries(request.questions)) {
    const answer = response.answers[id];
    if (!answer || answer.type !== question.type) throw new Error("missing or mismatched Jev answer");
    const options = Object.keys(question.criteria);
    const probabilities = answer.probabilities;
    if (
      !options.includes(answer.choice) || !isProbability(answer.confidence) || !probabilities
      || Object.keys(probabilities).length !== options.length
      || options.some((option) => !isProbability(probabilities[option]))
      || Math.abs(Object.values(probabilities).reduce((sum, p) => sum + p, 0) - 1) > 0.015
      || probabilities[answer.choice]! + 0.000001 < Math.max(...Object.values(probabilities))
    ) {
      throw new Error("invalid Jev category distribution");
    }
  }
  return response;
}

/** Spaces request starts across every concurrent caller that shares it. */
export class JevRateLimiter {
  private next = 0;

  constructor(private readonly requestsPerSecond = 12) {
    if (!Number.isFinite(requestsPerSecond) || requestsPerSecond <= 0 || requestsPerSecond > 20) {
      throw new Error("use 1–20 requests per second");
    }
  }

  async wait(): Promise<void> {
    const now = Date.now();
    const start = Math.max(now, this.next);
    this.next = start + 1000 / this.requestsPerSecond;
    if (start > now) await new Promise((resolve) => setTimeout(resolve, start - now));
  }
}

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504, 529]);
const MAX_ATTEMPTS = 4;

export interface JevRequestOptions {
  apiKey: string;
  limiter: Pick<JevRateLimiter, "wait">;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Per-attempt timeout. Default 30 s. */
  timeoutMs?: number;
}

/** Send one request, retrying transient failures, and return the validated response. */
export async function requestJev(
  request: JevRequest,
  options: JevRequestOptions,
): Promise<{ response: JevResponse; attempts: number }> {
  if (!options.apiKey.trim()) throw new Error("TYPESAFE_API_KEY is not set");
  const send = options.fetch ?? fetch;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    await options.limiter.wait();
    let result: Response;
    try {
      result = await send(JEV_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
    } catch {
      if (attempt === MAX_ATTEMPTS) throw new Error(`Jev network request failed after ${MAX_ATTEMPTS} attempts`);
      await sleep(500 * 2 ** (attempt - 1));
      continue;
    }
    if (result.ok) {
      return { response: validateJevResponse(await result.json(), request), attempts: attempt };
    }
    if (!RETRY_STATUSES.has(result.status) || attempt === MAX_ATTEMPTS) throw new Error(`Jev HTTP ${result.status}`);
    const retry = result.headers.get("retry-after");
    const delay = retry === null ? NaN : /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - Date.now();
    if (Number.isFinite(delay) && delay > 60_000) throw new Error("Jev asked to retry after more than 60 s");
    await sleep(Math.max(500 * 2 ** (attempt - 1), Number.isFinite(delay) ? delay : 0));
  }
  throw new Error("Jev retry limit reached");
}
