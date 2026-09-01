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
