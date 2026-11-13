/**
 * Wait and try again when a model call hits a rate limit or an overload.
 * Round 4 lost 5 loops to HTTP 429: the drawer's and the reviewers' accounts
 * serve many boards at once.
 */

/** The most tries one call gets, the first among them. */
export const RATE_LIMIT_TRIES = 5;

/** Whether an error text of a model CLI names a rate limit (HTTP 429) or an overload (529, 503). */
export const isRateLimitText = (text: string): boolean =>
  /\b429\b|rate.?limit|too many requests|overloaded|\b529\b|\b503\b|service unavailable|no_eligible_account/i.test(text);

export const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/**
 * Run `attempt` until its result is not rate limited, at most
 * RATE_LIMIT_TRIES times. The wait doubles: `firstWaitMs`, then 2, 4 and 8
 * times it. `limited` is true for the last result when every try was limited.
 */
export async function retryRateLimited<T>(options: {
  attempt(attemptNumber: number): Promise<T>;
  limited(result: T): boolean;
  firstWaitMs: number;
  /** Told before each wait. */
  onWait?(attemptNumber: number, waitMs: number): void;
  sleep?(ms: number): Promise<void>;
}): Promise<{ result: T; tries: number; limited: boolean }> {
  for (let tries = 1; ; tries += 1) {
    const result = await options.attempt(tries);
    const limited = options.limited(result);
    if (!limited || tries === RATE_LIMIT_TRIES) return { result, tries, limited };
    const waitMs = options.firstWaitMs * 2 ** (tries - 1);
    options.onWait?.(tries, waitMs);
    await (options.sleep ?? sleep)(waitMs);
  }
}
