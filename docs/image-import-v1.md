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
rows are draggable. Dropping one onto the fixed canvas creates a slot and
image attachment at the logical drop point; an empty project receives its
root bone in the same undoable transaction. A bulk import is one immutable
project command, allowing one undo entry and one debounced recovery snapshot
for the whole drop.
