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

  it("merges shadows, weights, tracking, leading and radius", () => {
    expect(cn("shadow-glass", "shadow-dialog")).toBe("shadow-dialog");
    expect(cn("font-medium", "font-regular")).toBe("font-regular");
    expect(cn("tracking-normal", "tracking-micro")).toBe("tracking-micro");
    expect(cn("leading-ui", "leading-title")).toBe("leading-title");
    expect(cn("rounded", "rounded-pill")).toBe("rounded-pill");
  });

  it("merges z, easing and outline offset", () => {
    expect(cn("z-30", "z-popover")).toBe("z-popover");
    expect(cn("z-raised", "z-panel")).toBe("z-panel");
    expect(cn("ease-standard", "ease-emphasized")).toBe("ease-emphasized");
    expect(cn("outline-offset-2", "outline-offset-focus")).toBe("outline-offset-focus");
  });

  it("keeps a border width next to a border color, and merges two widths", () => {
    expect(cn("border-hairline border-rule")).toBe("border-hairline border-rule");
    expect(cn("border-hairline", "border-rail")).toBe("border-rail");
  });

  it("merges the layout widths", () => {
    expect(cn("w-80", "w-inspector")).toBe("w-inspector");
    expect(cn("w-sidebar", "w-sidebar-collapsed")).toBe("w-sidebar-collapsed");
    expect(cn("max-w-lane-text", "max-w-lane-wide")).toBe("max-w-lane-wide");
    expect(cn("max-w-inspector", "max-w-lane-code")).toBe("max-w-lane-code");
  });
});
