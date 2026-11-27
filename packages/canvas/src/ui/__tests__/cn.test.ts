import { describe, expect, it } from "bun:test";

import { cn } from "../cn";

// cn merges the design-system utilities by family: a later class of the same
// family replaces an earlier one, and classes of different families both stay.
describe("cn with the design-system utilities", () => {
  it.each([
    // Font size next to a text color.
    [["text-ui-lg text-primary-foreground"], "text-ui-lg text-primary-foreground"],
    [["text-ui-xs text-muted-foreground", "text-ink"], "text-ui-xs text-ink"],
    [["text-ui-xs", "text-ui-lg"], "text-ui-lg"],
    // Shadows, weights, tracking, leading and radius.
    [["shadow-glass", "shadow-dialog"], "shadow-dialog"],
    [["font-medium", "font-regular"], "font-regular"],
    [["tracking-normal", "tracking-micro"], "tracking-micro"],
    [["leading-ui", "leading-title"], "leading-title"],
    [["rounded", "rounded-pill"], "rounded-pill"],
    // Z, easing and outline offset.
    [["z-30", "z-popover"], "z-popover"],
    [["z-raised", "z-panel"], "z-panel"],
    [["ease-standard", "ease-emphasized"], "ease-emphasized"],
    [["outline-offset-2", "outline-offset-focus"], "outline-offset-focus"],
    // Border width next to a border color, and two widths.
    [["border-hairline border-rule"], "border-hairline border-rule"],
    [["border-hairline", "border-rail"], "border-rail"],
    // Layout widths.
    [["w-80", "w-inspector"], "w-inspector"],
    [["w-sidebar", "w-sidebar-collapsed"], "w-sidebar-collapsed"],
    [["max-w-lane-text", "max-w-lane-wide"], "max-w-lane-wide"],
    [["max-w-inspector", "max-w-lane-code"], "max-w-lane-code"],
  ] as const)("cn(%j) is %p: same family merges, different families stay", (inputs, expected) => {
    expect(cn(...inputs)).toBe(expected);
  });
});
