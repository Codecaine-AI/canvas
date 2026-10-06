import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { flat } from "@codecaine-ai/design-system";

/**
 * Vendored `cn` helper (see ../../../../PROVENANCE.md for its origin) —
 * the host-app-specific color helpers that lived alongside it were not
 * brought over. Kept as a tiny local copy so this package has no
 * dependency on any host app's utils module.
 */

/** The last segment of every token path in `group` ("font.size") of one flat token map. */
function tokenNames(tokens: Readonly<Record<string, unknown>>, group: string): string[] {
  const prefix = `${group}.`;
  return Object.keys(tokens)
    .filter((path) => path.startsWith(prefix))
    .map((path) => path.slice(prefix.length));
}

/** Border-width token names whose utility is also a color or a style utility (see `border-w` below). */
const BORDER_NAME_CLASHES = new Set(["none", "focus", "ring"]);

/** The layout width utilities: `--container-inspector`, `--container-sidebar`, `--container-sidebar-collapsed`. */
const LAYOUT_WIDTHS = [
  "inspector",
  ...tokenNames(flat.base, "layout.sidebar")
    .filter((name) => name.startsWith("width"))
    .map((name) => name.replace(/^width/, "sidebar")),
];

/**
 * tailwind-merge with the design-system theme keys. Plain twMerge reads an
 * unknown `text-*` or `shadow-*` suffix as a color, so it drops the size from
 * `text-ui-lg text-primary-foreground`. Each list below is the token family
 * whose utility suffix equals the token's last segment
 * (`font.size.ui-lg` -> `text-ui-lg`); the renamed ones are named.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      // text-micro, text-ui-2xs ... text-ui-lg, text-code, text-reading, text-title
      text: tokenNames(flat.base, "font.size"),
      // font-regular (medium, semibold and bold are Tailwind's names too)
      "font-weight": tokenNames(flat.base, "font.weight"),
      // tracking-normal, tracking-title, tracking-micro, tracking-micro-wide
      tracking: tokenNames(flat.base, "letter-spacing"),
      // leading-ui, leading-reading, leading-code, leading-row from line-height.*;
      // leading-title is line-height.tight (renamed), so it is named here.
      leading: [...tokenNames(flat.base, "line-height").filter((name) => name !== "tight"), "title"],
      // blur-glass, backdrop-blur-glass
      blur: tokenNames(flat.base, "blur"),
      // rounded-none, rounded-pill. radius.base has no rounded-base utility: the
      // bare `rounded` (and every rounded-xs ... rounded-4xl step) reads it.
      radius: tokenNames(flat.base, "radius").filter((name) => name !== "base"),
      // shadow-glass, shadow-dialog (theme tokens: both themes hold the same paths)
      shadow: tokenNames(flat.light, "shadow"),
    },
    classGroups: {
      // z-raised, z-panel, z-overlay, z-popover, z-top
      z: [{ z: tokenNames(flat.base, "z") }],
      // border-hairline, border-rail. border.width.focus and .ring are left out:
      // `border-focus` and `border-ring` are also border COLORS (color.focus-ring and
      // the hosts' --ring knob), and `border-none` is Tailwind's border-style.
      "border-w": [{ border: tokenNames(flat.base, "border.width").filter((name) => !BORDER_NAME_CLASHES.has(name)) }],
      // ease-standard, ease-emphasized, ease-decelerate
      ease: [{ ease: tokenNames(flat.base, "motion.easing") }],
      // outline-offset-focus (focus.ring.offset)
      "outline-offset": [{ "outline-offset": ["focus"] }],
      // w-inspector, w-sidebar, w-sidebar-collapsed (layout.*.width)
      w: [{ w: LAYOUT_WIDTHS }],
      // max-w-inspector, max-w-sidebar, max-w-sidebar-collapsed, max-w-lane-text/-code/-wide
      "max-w": [{ "max-w": [...LAYOUT_WIDTHS, ...tokenNames(flat.base, "layout.lane").map((name) => `lane-${name}`)] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
