# `.boneanim` archive version 1

The `.boneanim` extension identifies a ZIP archive. The archive is
self-contained: project metadata references copied image files inside the
archive and never the user's original import directory.

## Layout

```text
manifest.json
project.json
assets/<entity-id>.<extension>
```

The archive contains no required directory entries. All paths use `/`, are
relative, and are UTF-8. `assets/` contains only source image files named by
their opaque asset ID. The extension is the normalized extension matching the
asset MIME type (`png`, `jpg`, or `webp`).

## Manifest

`manifest.json` is small enough to inspect before reading `project.json`:

```json
{
  "format": "boneanim",
  "archiveVersion": 1,
  "projectSchemaVersion": 1,
  "projectId": "00000000-0000-4000-8000-000000000001",
  "projectFile": "project.json",
  "assets": [
    {
      "id": "00000000-0000-4000-8000-000000000002",
      "path": "assets/00000000-0000-4000-8000-000000000002.png",
      "mimeType": "image/png",
      "byteLength": 4096,
      "sha256": "..."
    }
  ]
}
```

`sha256` is the lowercase hexadecimal SHA-256 digest of the exact asset bytes.
The project ID and every asset ID must agree with `project.json`. The
manifest's asset list is authoritative for archive membership and integrity
checking.

## Import and export rules

- The editor's `Project` menu uses `Import .boneanim` and `Export project
  archive` for this format. The toolbar `Export` action is reserved for
  generated sprite-sheet output and does not produce a `.boneanim` archive.
- Export writes deterministic JSON encoding and stable asset ordering by ID.
- Import first checks ZIP paths, manifest shape, archive version, project
  schema, asset hashes, and image signatures. No active project state changes
  until every check succeeds.
- Absolute paths, `..` path segments, duplicate paths, duplicate IDs, files
  outside the declared layout, and undeclared asset files are rejected.
- A failed import returns diagnostics and leaves the current project and its
  asset blobs untouched.
- The archive does not contain IndexedDB records, thumbnails, browser session
  state, or generated sprite sheets.

## Size and encoding limits

- JSON files are UTF-8 without a byte-order mark.
- Numeric values follow project schema version 1's finite-number rules.
- An implementation may impose a configurable archive byte limit, but must
  report that limit in the import diagnostic rather than truncating input.
