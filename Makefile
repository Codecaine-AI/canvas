.PHONY: studio studio-web layout-lab

# Build and launch the native Mac studio app.
studio:
	bun install
	bun run --cwd packages/studio studio

# Run the existing browser-based development server.
studio-web:
	bun run dev:studio

# Run the layout-lab dev server (hot reload) on port 4700.
layout-lab:
	bun run dev:layout-lab
