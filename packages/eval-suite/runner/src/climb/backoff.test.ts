import { describe, expect, test } from "bun:test";

import { isRateLimitText, retryRateLimited } from "./backoff.ts";

describe("climb rate limit backoff", () => {
  test("a rate limit or an overload is read from the error text, and no other error is", () => {
    for (const text of [
      "unexpected status 429 Too Many Requests", "Rate limit reached for gpt-6.1-sol", "rate_limit_exceeded", "The model is overloaded. Try again later.",
      "API Error: Request rejected (429) · No account can serve claude-opus-5-5 right now (no_eligible_account)", "HTTP 529", "503 Service Unavailable",
    ]) expect([text, isRateLimitText(text)]).toEqual([text, true]);
    for (const text of ["", "unknown model", "exit code 1", "invalid schema at $.findings", "read 4290 bytes", "port 15030 refused"]) {
      expect([text, isRateLimitText(text)]).toEqual([text, false]);
    }
  });

  const retry = async (limitedTries: number) => {
    const waits: Array<[number, number]> = [];
    const attempts: number[] = [];
    const outcome = await retryRateLimited({
      attempt: async (attempt) => { attempts.push(attempt); return attempt; },
      limited: (attempt) => attempt <= limitedTries,
      firstWaitMs: 1000,
      onWait: (attempt, waitMs) => { waits.push([attempt, waitMs]); },
      sleep: async () => {},
    });
    return { ...outcome, attempts, waits };
  };

  test("a try that is not limited ends the work at once", async () => {
    expect(await retry(0)).toEqual({ result: 1, tries: 1, limited: false, attempts: [1], waits: [] });
  });

  test("each wait is double the one before, and the work goes on at the first try that gets through", async () => {
    expect(await retry(3)).toEqual({ result: 4, tries: 4, limited: false, attempts: [1, 2, 3, 4], waits: [[1, 1000], [2, 2000], [3, 4000]] });
  });

  test("the 5th limited try is the last: no wait follows it", async () => {
    expect(await retry(99)).toEqual({ result: 5, tries: 5, limited: true, attempts: [1, 2, 3, 4, 5], waits: [[1, 1000], [2, 2000], [3, 4000], [4, 8000]] });
  });
});
