# Release workflows v1

This page collects the three browser workflows needed to operate and diagnose
the first release.

## Keyboard workflow

Use the top-toolbar `?` button or press `?` to open the shortcut reference.
History shortcuts use the platform modifier (`Ctrl` on Windows/Linux and
`Cmd` on macOS. `W`, `E`, `R`, and `T` select Move, Rotate, Scale, and Shear;
`F2`, `Delete`, `K`, `Escape`, `Page Up`, and `Page Down` provide the direct
rig and keying workflows described in [Keyboard shortcuts](keyboard-shortcuts-v1.md).
Space and the arrow keys operate on the active animation clip in Animate mode.
Focus a form field when editing a numeric value or name; global shortcuts are
intentionally disabled for input, textarea, select, and contenteditable
elements.

## Viewport presentation workflow

1. Open `Load example`, switch to Animate, and move the playhead to a keyed
   frame. Select a rig item so the authoring state is visible.
2. Use the compact `Presentation` control in the viewport toolbar to compare
   `Authoring`, `Visual preview`, and `Gameplay preview`. Authoring shows bones
   and selection guides; Visual preview shows artwork without editor overlays;
   Gameplay preview shows gameplay guides without bones.
3. In either preview, verify that pan, zoom, Fit, playback, frame navigation,
   scrubbing, tree selection, and inspector selection still work. Preview
   pointer drags do not transform entities; `Escape` cancels a pending gesture.
   Returning to Authoring restores transform guides and handles.
4. Switch between Setup and Animate, reload, and load a second project. The
   selected preset persists only for its project, malformed preference storage
   falls back to Authoring, and none of these actions creates a project-history
   entry.
5. For release evidence, capture the three presets at 1120×720 and 1440×900.
   Compare Visual preview canvas samples with the clean keyed frame from
   `Export ZIP`; confirm the canvas has no renderer alert and contains scene
   pixels. The permanent proof is:

   `bunx playwright test tests/e2e/viewport-presets.spec.ts --project=chromium --workers=1`

   The proof writes inspectable screenshots to `/tmp/rigatta-v1-<width>-<preset>.png`.
   The committed viewport evidence is `f09f43d`.

## Focused export and import evidence

The Export workflow opens the built-in example, validates combined and
per-clip grid ZIPs, packed output, and forced multipage packed output, then
checks cancellation plus render, composition, packaging, and download failure
recovery. `tests/e2e/export.spec.ts` reports 9/9 Chromium tests.

The external-drop workflow places one PNG atomically at its logical canvas
point, verifies undo/redo and reload recovery, routes multiple files and
folders to Assets without placement, and reports unsupported, invalid, and
duplicate-file failures with keyboard-accessible empty-canvas actions.
`tests/e2e/external-drop.spec.ts` reports 10/10 Chromium tests.

The focused timeline proof covers the default 260 px Animate timeline at
1120x720 and 1440x900, including no selection, selected-bone, and All keyed
states, sticky containment, scrolling, and at least three visible data rows.
See `tests/e2e/timeline-layout-proof.spec.ts`.

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

## Project menu workflow

1. Open `Project` and use `Project settings` to rename the current project.
   The dialog reports the fixed logical canvas and does not expose export
   settings.
2. Use `Open recent` to select a stable project or a recovery snapshot. The
   current authored project remains active if replacement is declined.
3. Use `Import .rigatta` to choose a self-contained archive. Archive
   validation completes before replacement confirmation, and invalid archives
   leave the current project untouched.
4. Use `Export project archive` to download editable project JSON and source
   image bytes. Use the separate toolbar `Export` action for sprite-sheet
   output.
5. `New project` and `Load example` use the same authored-content replacement
   confirmation rule and schedule the resulting project for recovery autosave.

The complete action contract is recorded in
[`project-menu-v1.md`](project-menu-v1.md).

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
