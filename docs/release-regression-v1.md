# Clean-checkout regression v1

The release gate was run from a disposable clone of the repository on
2026-09-01:

```sh
clean_checkout_dir=$(mktemp -d /tmp/bone-animation-clean.XXXXXX)
git clone --no-local /home/davidg/Projects/bone-animation "$clean_checkout_dir"
cd "$clean_checkout_dir"
bun install --frozen-lockfile
bun run check
CI=1 bun run test:e2e
```

The clean checkout produced these results:

- `bun install --frozen-lockfile` installed the locked dependency graph.
- `bun run check` passed lint, 167 unit tests with 514 expectations, strict
  typecheck, and the production build.
- `CI=1 bun run test:e2e` passed all 28 Chromium browser tests.

The browser suite covered the empty shell, built-in example, recovery,
fixed-canvas rendering, setup editing, Animate workflows, gameplay metadata,
image import, export controls, keyboard shortcuts, supported desktop layouts,
and PixiJS atlas loading.

## Focused follow-up evidence

The committed focused browser proofs report 9/9 Chromium tests for
`tests/e2e/export.spec.ts` and 10/10 for `tests/e2e/external-drop.spec.ts`.
They cover downloaded combined/per-clip grid, packed, and forced multipage
exports with cancellation and failure recovery, plus single-image placement,
bulk/folder import handoff, failure summaries, accessibility, undo, and reload.
The timeline layout proof is `tests/e2e/timeline-layout-proof.spec.ts`; the
viewport presentation evidence is in commit `f09f43d` and
`tests/e2e/viewport-presets.spec.ts`. These are focused additions to the
recorded clean-checkout gate; see the final R0 evidence below.

R0 evidence: Implementation commit `73671f7` covers the verified work from
`3cad3f8` through `73671f7`; `bun run check` passed with 352 unit tests plus
lint/typecheck/build, `bun run test:e2e` passed 152 Chromium tests, and
`git diff --check` passed. Visible review artifacts are
`/tmp/bone-animation-v1-{1120,1440}-{authoring,visual-preview,gameplay-preview}.png`
and `/tmp/bone-animation-timeline-*.png`.
