# Contributing to Rigatta

## Toolchain

Rigatta uses Bun for dependency management, development serving, tests, and production builds. The browser application uses strict TypeScript, React, PixiJS, plain CSS, IndexedDB through `idb`, `fflate` for ZIP data, and Valibot for runtime schemas.

Install the exact dependency graph with:

```sh
bun install --frozen-lockfile
```

Available scripts are:

- `bun run dev` — start the hot-reloading server on port 3000.
- `bun run typecheck` — run TypeScript without emitting files.
- `bun run lint` — run ESLint over TypeScript and TSX files.
- `bun run test` — run Bun unit and integration tests.
- `bun run build` — type-check and create the minified production build in `dist`.
- `bun run check` — run lint, unit tests, type-checking, and the production build.
- `bun run test:e2e` — run the Playwright suite against desktop Chromium.

Run `bun run check` for every change. Run `bun run test:e2e` when a change affects browser behavior, rendering, persistence integration, import, export, layout, accessibility, or user workflows.

## Code conventions

- Keep TypeScript strict. Do not use `any` or non-null assertions to bypass the type checker.
- Validate unknown, persisted, and external values at runtime before treating them as domain data.
- Prefer pure functions, immutable values, early returns, shallow control flow, and array transformations.
- Prefer function expressions with descriptive names over anonymous callbacks assigned as primary module operations.
- Avoid classes in application code. Isolate unavoidable class-based third-party APIs behind typed adapters.
- Keep animation and project-domain modules independent of React, PixiJS, IndexedDB, and browser UI code.
- Represent saved project mutations with typed commands and immutable domain operations so undo, redo, validation, and autosave remain coherent.
- Keep transient presentation and interaction state out of serialized project data.
- Match the formatting and tab indentation of the surrounding file.

## Testing boundaries

Unit and integration tests under `tests/unit` cover domain operations, transforms, interpolation, pose evaluation, history, validation, persistence, asset processing, layout models, and export generation.

Playwright tests under `tests/e2e` cover the supported Chrome workflows, including project recovery, rig authoring, animation editing, layout behavior, accessibility, imports, downloaded exports, and reloading generated atlas metadata through PixiJS.

Changes to a serialized schema or generated file format should add or update runtime validation, round-trip coverage, malformed-input coverage, and relevant browser proof. Changes affecting preview or export pose behavior should verify both paths continue to use equivalent evaluated state.
