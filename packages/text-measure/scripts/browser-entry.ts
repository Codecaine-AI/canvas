// Bundled by scripts/check-browser.ts for a real browser page: exposes the
// browser entry on globalThis so the check can drive it.
import * as api from "../src/browser.ts";

(globalThis as unknown as { tm: typeof api }).tm = api;
