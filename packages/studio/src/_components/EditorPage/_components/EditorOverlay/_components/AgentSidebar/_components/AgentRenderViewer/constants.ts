export const VIEWER_ENTER_STYLES = `
@keyframes studio-agent-render-enter {
  from {
    opacity: 0;
    transform: translate3d(0, 6px, 0);
  }

  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  [data-agent-render-viewer-panel] {
    animation-duration: 1ms !important;
  }
}
`;
