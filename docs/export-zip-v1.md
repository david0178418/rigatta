# Export ZIP packaging v1

Multifile exports are packaged with `createExportZip`. File paths must be
relative, slash-separated, normalized, and unique. Entries are sorted
lexicographically before ZIP creation, compression uses a fixed level, and the
archive timestamp is fixed so identical file inputs produce identical bytes.

`createExportZipBlob` wraps the deterministic bytes as an
`application/zip` Blob for a browser download. Empty packages and unsafe paths
are rejected before any archive is emitted.
