# Release workflows v1

This page collects the three browser workflows needed to operate and diagnose
the first release.

## Keyboard workflow

Use the top-toolbar `?` button or press `?` to open the shortcut reference.
History shortcuts use the platform modifier (`Ctrl` on Windows/Linux and
`Cmd` on macOS). Space and the arrow keys operate on the active animation clip
in Animate mode. Focus a form field when editing a numeric value or name;
global shortcuts are intentionally disabled for input, textarea, select, and
contenteditable elements.

## Recovery workflow

1. Continue editing. Each committed project command schedules a debounced
   recovery snapshot in IndexedDB; the project header reports `Saving...` while
   the snapshot is queued or being written, then `Saved locally` after the
   recovery write succeeds.
2. If the tab or browser exits before a stable save, reload the editor. Startup
   lists recent stable projects and recovery snapshots and opens the newest
   recovery snapshot for the most recent project.
3. Verify the project name, assets, and last edits. A successful stable save
   clears the matching recovery snapshot.
4. If `Save failed` appears, keep the project open and make another committed
   edit; the next successful recovery write returns the header to `Saved locally`
   and clears the failure message.
5. If startup cannot open IndexedDB, reports malformed records, or cannot
   restore asset blobs, keep the current browser storage intact and use the
   fatal/unsupported message to diagnose the browser capability or storage
   quota before retrying.

The recovery snapshot is separate from the stable project record and is
validated with the same project and image rules.

## PixiJS loading workflow

1. The viewport creates one Pixi application with a transparent canvas whose
   internal dimensions equal `logicalCanvas`.
2. Image attachment references resolve to local IndexedDB `Blob` values. The
   renderer validates the image signature and dimensions, decodes the blob with
   `createImageBitmap`, and creates a Pixi texture at the adapter boundary.
3. Domain transforms are converted to Pixi matrices. Setup layers are rendered
   manually so grid, attachments, gameplay guides, bones, and selection guides
   share the fixed logical coordinate system.
4. On project or asset changes, the adapter destroys old textures and bitmaps
   before replacing the content. Renderer failure appears in the viewport;
   missing blobs and invalid image bytes do not produce a partial render.
5. Export validation reloads generated atlas metadata through Pixi before the
   output is considered compatible, with special coverage for trim offsets and
   source sizes.

Detailed persistence and renderer contracts remain in
[`indexeddb-persistence-v1.md`](indexeddb-persistence-v1.md),
[`fixed-canvas-rendering-v1.md`](fixed-canvas-rendering-v1.md), and
[`pixi-validation-v1.md`](pixi-validation-v1.md).
