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
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
