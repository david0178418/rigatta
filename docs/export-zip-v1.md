# Export ZIP packaging v1

Multifile exports are packaged with `createExportZip`. File paths must be
relative, slash-separated, normalized, and unique. Entries are sorted
lexicographically before ZIP creation, compression uses a fixed level, and the
archive timestamp is fixed so identical file inputs produce identical bytes.

`createExportZipBlob` wraps the deterministic bytes as an
`application/zip` Blob for a browser download. Empty packages and unsafe paths
are rejected before any archive is emitted.

## Focused Chromium evidence

The browser workflow opens the built-in example's Export dialog and validates
downloaded ZIP contents for combined grid, per-clip grid, packed, and forced
multipage packed output. It also covers cancellation and render, composition,
packaging, and browser-download failure recovery without partial downloads.
`tests/e2e/export.spec.ts` reports 9/9 Chromium tests.
