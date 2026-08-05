// Shim: the sidebar moved to prompt-kit's lab package (2026-08-04 audit) so
// the observatory mounts the same panel — this path keeps existing imports
// working. New code should import from @agent-kernel/viewer-ui directly.
export {
  PromptStyleSidebar,
  clampPromptStyleSidebarWidth,
  PROMPT_STYLE_SIDEBAR_DEFAULT_WIDTH,
  PROMPT_STYLE_SIDEBAR_MIN_WIDTH,
  PROMPT_STYLE_SIDEBAR_MAX_WIDTH,
  type PromptStyleSidebarProps,
} from "@agent-kernel/viewer-ui";
