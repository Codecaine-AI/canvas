import type { ReactNode } from "react";

export type IconName = "traces" | "config" | "moon";

export type IconProps = {
  name: IconName;
};

// Nav and topbar glyphs on a 24px grid, after templates/react-app-shell's Icon (config is its
// "settings" sliders) and simple-research-kernel's trace pulse and moon. The shell sizes the <svg>
// and strokes it in currentColor.
const glyphs: Record<IconName, ReactNode> = {
  traces: <path d="M3 12h4l3-7 4 14 3-7h4" />,
  config: (
    <>
      <path d="M6 4v4M6 12v8M12 4v10M12 18v2M18 4v2M18 10v10" />
      <circle cx="6" cy="10" r="2" />
      <circle cx="12" cy="16" r="2" />
      <circle cx="18" cy="8" r="2" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />,
};

export function Icon({ name }: IconProps) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyphs[name]}
    </svg>
  );
}
