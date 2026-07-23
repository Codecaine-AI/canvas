.PHONY: studio studio-web docs harness traces

# Build and launch the native Mac studio app WITH the agent running:
# the canvas-agent harness boots on :4820 alongside (skipped if one is
# already running there), and VITE_STUDIO_DEV_PAGES=1 bakes the dev rail
# into the packaged build. (The agent trace/operator pages are no longer
# in-app — they're the standalone viewer, `make traces`.) The harness we
# started is stopped when the app exits.
studio:
	bun install
	@if curl -sf http://127.0.0.1:4820/health >/dev/null 2>&1; then \
		echo "agent harness: already running on :4820 — leaving it"; \
		VITE_STUDIO_DEV_PAGES=1 bun run --cwd packages/studio studio; \
	else \
		echo "agent harness: starting on :4820"; \
		bun run --cwd packages/canvas-agent harness & HARNESS_PID=$$!; \
		trap 'kill $$HARNESS_PID 2>/dev/null' EXIT INT TERM; \
		VITE_STUDIO_DEV_PAGES=1 bun run --cwd packages/studio studio; \
	fi

# Run the canvas-agent layout harness alone (sibling Bun service on :4820;
# studio's agent proxy fronts it, so the browser only ever talks to the
# studio origin). Kernel runtime state lives in .agent-kernel/ (gitignored).
harness:
	bun install
	bun run dev:harness

# Run the browser-based development server, harness alongside (dev mode
# already enables the agent pages/dev rail via import.meta.env.DEV).
studio-web:
	@if curl -sf http://127.0.0.1:4820/health >/dev/null 2>&1; then \
		echo "agent harness: already running on :4820 — leaving it"; \
		bun run dev:studio; \
	else \
		echo "agent harness: starting on :4820"; \
		bun run --cwd packages/canvas-agent harness & HARNESS_PID=$$!; \
		trap 'kill $$HARNESS_PID 2>/dev/null' EXIT INT TERM; \
		bun run dev:studio; \
	fi

# The standalone agent trace viewer (packages/canvas-agent/src/viewer) in
# its own browser window on :4830, side-by-side with studio. Boots the
# harness on :4820 first if one isn't already answering /health (same
# pattern as the studio targets; a harness we started is stopped when the
# viewer exits). On macOS the browser window opens itself once vite is up.
traces:
	bun install
	@if [ "$$(uname)" = "Darwin" ]; then \
		( for i in $$(seq 1 30); do \
			curl -sf http://localhost:4830/ >/dev/null 2>&1 && { open http://localhost:4830; exit 0; }; \
			sleep 0.5; \
		done ) & \
	fi; \
	if curl -sf http://127.0.0.1:4820/health >/dev/null 2>&1; then \
		echo "agent harness: already running on :4820 — leaving it"; \
		bun run dev:agent-viewer; \
	else \
		echo "agent harness: starting on :4820"; \
		bun run --cwd packages/canvas-agent harness & HARNESS_PID=$$!; \
		trap 'kill $$HARNESS_PID 2>/dev/null' EXIT INT TERM; \
		bun run dev:agent-viewer; \
	fi

# Serve this repo's docs/ on port 4810 — off the usual docs ports
# (4800–4804) so it never collides with a running docs-system app.
# Prefers the LIVE sibling docs-system checkout (dogfooding: uncommitted
# viewer/theme work fans out here; the SPA staleness check rebuilds on each
# boot), falling back to the vendored tools/docs-framework submodule. The
# shared theme comes from the themes -> ../docs-system/themes symlink,
# and --theme-locked keeps this serve a pure consumer of it: the repo
# default theme always applies, the style rail is hidden, and theme writes
# are refused — tuning happens ONLY in the primary docs-system app.
# Single-port mode: API + viewer SPA together; doc.json edits are picked up
# live via fs-watch (--dev is only for hacking on the viewer SPA itself,
# and spawns vite on an uncontrolled second port).
DOCS_SYSTEM ?= ../docs-system
docs:
	@if [ -f "$(DOCS_SYSTEM)/packages/docs-cli/src/index.ts" ]; then \
		echo "docs: serving with live checkout $(DOCS_SYSTEM)"; \
		bun "$(DOCS_SYSTEM)/packages/docs-cli/src/index.ts" serve --root docs --port 4810 --theme-locked; \
	else \
		echo "docs: live checkout not found, using vendored tools/docs-framework"; \
		bun tools/docs-framework/packages/docs-cli/src/index.ts serve --root docs --port 4810 --theme-locked; \
	fi
