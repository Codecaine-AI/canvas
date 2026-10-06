import type { Lightbox as LightboxTarget } from "../../types";

export type LightboxProps = {
  lightbox: LightboxTarget;
  onClose: () => void;
};

export function Lightbox({ lightbox, onClose }: LightboxProps) {
  return (
    <div
      role="button"
      aria-label="Close full-size render"
      // A dark region in either app theme, like the agent's render viewer.
      data-theme="dark"
      className="fixed inset-0 z-popover flex cursor-zoom-out flex-col items-center justify-center gap-3 bg-page/85 p-8"
      onClick={() => onClose()}
    >
      <img
        src={lightbox.src}
        alt={lightbox.caption}
        className="min-h-0 max-w-full flex-1 object-contain"
      />
      <span className="font-mono text-ui-xs text-secondary">{lightbox.caption}</span>
    </div>
  );
}
