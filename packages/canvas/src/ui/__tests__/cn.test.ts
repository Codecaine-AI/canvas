import { describe, expect, it } from "bun:test";

import { cn } from "../cn";

// cn merges the design-system utilities by family: a later class of the same
// family replaces an earlier one, and classes of different families both stay.
describe("cn with the design-system utilities", () => {
  it("keeps a font size next to a text color", () => {
    expect(cn("text-ui-lg text-primary-foreground")).toBe("text-ui-lg text-primary-foreground");
    expect(cn("text-ui-xs text-muted-foreground", "text-ink")).toBe("text-ui-xs text-ink");
    expect(cn("text-ui-xs", "text-ui-lg")).toBe("text-ui-lg");
  });
});
