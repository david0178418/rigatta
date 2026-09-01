# Export diagnostics v1

Export preflight checks run from the selected clips and the project's export
settings before frame work begins.

- `atlas-size` reports an invalid maximum texture size or a grid layout that
  cannot fit the fixed logical frame cells and selected frame count.
- `storage-quota` reports unavailable browser storage estimates, low remaining
  headroom, or a remaining quota below the current source-asset byte set.
- `export-memory` compares a deterministic peak estimate against the editor's
  safety limit. The estimate includes sampled RGBA frame buffers, atlas page
  buffers, and bounded metadata overhead.

Diagnostics carry `warning` or `error` severity and a path identifying the
setting or browser capability involved. The export panel shows the diagnostics
and the estimated peak before the export pipeline is allowed to proceed.
