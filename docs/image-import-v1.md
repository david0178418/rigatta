# Image import v1

The editor accepts PNG, JPEG, and WebP files. Directory picker and drag/drop
imports traverse nested directories, normalize Windows separators to `/`, and
reject absolute paths, parent traversal, empty paths, and duplicate relative
paths. Unsupported extensions are ignored when mixed into a directory import;
files that identify as supported images are validated before they enter the
project catalog.

Each imported image is copied into a `Blob` owned by the project. The catalog
stores an opaque asset ID, display name, normalized relative path, MIME type,
and decoded pixel dimensions. The image decoder validates the byte signature
and dimensions before calling the browser's `createImageBitmap` boundary, so
the editor never relies on a continued handle to the source directory.

The library renders normalized folders as a deterministic tree and searches
asset paths case-insensitively while retaining matching parent folders. Asset
rows are available in list, compact, and thumbnail densities; all three keep
the same selection and drag behavior. Thumbnail images use object URLs from
the stored blobs, revoke those URLs when the browser lifetime or asset set
changes, and use native lazy loading so offscreen rows are not decoded eagerly.

Hovering, focusing, or selecting an asset shows an in-flow preview with its
dimensions, format, normalized relative path, and every slot/attachment that
uses it. The preview is non-interactive and remains inside the library flow,
so it does not steal focus or cover the canvas and slot drop targets.

Asset rows are draggable. Dropping one onto the fixed canvas creates a slot and
image attachment at the logical drop point; an empty project receives its
root bone in the same undoable transaction. A bulk import is one immutable
project command, allowing one undo entry and one debounced recovery snapshot
for the whole drop.

## Focused browser evidence

`tests/e2e/external-drop.spec.ts` reports 10/10 Chromium tests. The workflow
covers one-image atomic placement with undo/redo and reload recovery, bulk-file
and folder handoff to Assets without automatic placement, unsupported/mixed
and decode-failure summaries, duplicate-path rejection, existing-rig guidance,
and keyboard operation of the empty-canvas actions.
