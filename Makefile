.PHONY: studio studio-evals studio-web docs eval eval-clean

# Build and launch the native Mac studio app. VITE_STUDIO_DEV_PAGES=1 bakes
# the dev rail into the packaged build.
studio:
	cd .. && bun install
	VITE_STUDIO_DEV_PAGES=1 bun run --cwd packages/studio studio

# viewer for eval-suite boards (canvases/evals/); read-only by convention while a run is active.
studio-evals: export CANVAS_DIR = $(CURDIR)/canvases/evals
studio-evals:
	mkdir -p "$(CANVAS_DIR)"
	CANVAS_DIR="$(CANVAS_DIR)" $(MAKE) studio

# Run the browser-based development server (dev mode already enables the dev
# rail via import.meta.env.DEV).
studio-web:
	bun run dev:studio

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
# Also boots the docs kernel on :4840 by default (override with DOCS_KERNEL_PORT),
# pointing it at this repo's docs/ so annotate/AI editing works; opens the browser on macOS.
DOCS_SYSTEM ?= ../docs-system
docs:
	@if [ -f "$(DOCS_SYSTEM)/packages/docs-cli/src/index.ts" ]; then \
		echo "docs: serving with live checkout $(DOCS_SYSTEM)"; \
		if [ "$$(uname)" = "Darwin" ]; then \
			( for i in $$(seq 1 60); do \
				curl -sf http://localhost:4810/ >/dev/null 2>&1 && { open http://localhost:4810; exit 0; }; \
				sleep 0.5; \
			done ) & \
		fi; \
		KERNEL_PORT="$${DOCS_KERNEL_PORT:-4840}"; \
		if curl -sf http://127.0.0.1:$$KERNEL_PORT/health >/dev/null 2>&1; then \
			echo "docs kernel: already running on :$$KERNEL_PORT — leaving it"; \
		else \
			echo "docs kernel: starting on :$$KERNEL_PORT"; \
			DOCS_KERNEL_DOCS_ROOT="$(CURDIR)/docs" DOCS_KERNEL_PORT=$$KERNEL_PORT bun run --cwd "$(DOCS_SYSTEM)/packages/docs-kernel" start & KERNEL_PID=$$!; \
			trap 'kill $$KERNEL_PID 2>/dev/null' EXIT INT TERM; \
		fi; \
		bun "$(DOCS_SYSTEM)/packages/docs-cli/src/index.ts" serve --root docs --port 4810 --theme-locked; \
	else \
		echo "docs: live checkout not found, using vendored tools/docs-framework"; \
		echo "docs kernel: not started in vendored mode (annotate/AI editing needs the live ../docs-system checkout)"; \
		bun tools/docs-framework/packages/docs-cli/src/index.ts serve --root docs --port 4810 --theme-locked; \
	fi

# Run the eval suite end-to-end. The runner spawns its own file API + harness on
# ephemeral ports for this run only and stops both when the run ends — it never
# reuses the dev harness on :4820 or a service left over from an earlier run.
eval: RUN_ID := $(shell date +%Y-%m-%d)-eval-$(shell date +%H%M%S)
eval:
	@echo "eval: starting run $(RUN_ID) in $(CURDIR)/packages/eval-suite/runs"
	bun run --cwd packages/eval-suite/runner src/cli.ts suite --run-id "$(RUN_ID)"
	@echo "eval: finished run $(RUN_ID) in $(CURDIR)/packages/eval-suite/runs"

# Remove all eval-suite runs.
eval-clean:
	bun run --cwd packages/eval-suite/runner src/cli.ts clean --all
