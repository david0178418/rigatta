# IndexedDB persistence v1

The editor stores project metadata and image bytes in separate IndexedDB object
stores. The database name is `bone-animation-projects`, and the current schema
version is `1`.

## Stores

| Store | Key | Purpose |
| --- | --- | --- |
| `projects` | project ID | The last stable project snapshot and timestamps. |
| `assets` | snapshot/asset key | Image `Blob` values and their catalog metadata. |
| `recoveries` | project ID | The newest debounced working snapshot. |

The `assets` store indexes `snapshotKey`, which separates stable assets from
recovery assets. A stable save replaces the stable snapshot, removes its stale
asset records, and clears the matching recovery snapshot in one transaction.
Autosave writes the recovery snapshot without changing the stable project.

## Validation and recovery

Project records are parsed through the versioned Valibot schema whenever they
are loaded. Asset records are checked against the project catalog, image MIME
signature, decoded dimensions, and ownership key before a snapshot is returned.
Writes validate the same requirements before opening the write transaction.

Recent-project listing merges stable and recovery records by project ID. A
newer recovery record is surfaced as recoverable work. Opening a project can
update its `lastOpenedAt` timestamp, while clearing or deleting a project also
removes its recovery metadata and image blobs.

The autosave scheduler coalesces committed snapshots during a configurable
debounce window and exposes an explicit `flush` operation for page lifecycle
handling. A scheduled snapshot reports `scheduled`, `saving`, then either
`saved` or `error` through typed callbacks; the editor presents those states as
`Saving...`, `Saved locally`, or `Save failed`. A page-hide flush drains the
pending recovery snapshot, while a later successful snapshot replaces a failed
state. Storage persistence requests and quota estimates are separate capability
calls so unsupported APIs and quota failures can be shown to the user instead
of being hidden.

## Recovery workflow

After startup opens the database, recent stable and recovery records are
merged by project ID and ordered by update time. A newer recovery record is
opened automatically for the most recent project. The editor continues to use
the recovery record while the user verifies the restored work; the next stable
save replaces the stable metadata and asset records and clears that recovery
record. A malformed project or asset record stops startup with a fatal message
rather than replacing the open state with unvalidated data.
