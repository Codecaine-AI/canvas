import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Vendored `cn` helper (see ../../../../PROVENANCE.md for its origin) —
 * the host-app-specific color helpers that lived alongside it were not
 * brought over. Kept as a tiny local copy so this package has no
 * dependency on any host app's utils module.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
