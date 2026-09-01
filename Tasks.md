# Task List

Tasks are ordered by dependency. A task is complete only when its implementation, tests, and relevant documentation are committed together.

## Phase 0: specification and prototypes

- [x] **P0-01** Define the coordinate system, canvas origin, angle units, and affine transform order.
- [x] **P0-02** Define project schema version 1 and stable entity ID rules. Depends on P0-01.
- [x] **P0-03** Define the `.boneanim` manifest and archive layout. Depends on P0-02.
- [x] **P0-04** Define standard PixiJS atlas output and companion gameplay metadata schemas. Depends on P0-01.
- [x] **P0-05** Prototype PixiJS fixed-canvas rendering and PNG extraction. Depends on P0-01.
- [x] **P0-06** Prototype alpha trimming and verify `sourceSize` and `spriteSourceSize` alignment by reloading the atlas in PixiJS. Depends on P0-04 and P0-05.
- [x] **P0-07** Prototype Chrome directory picker and recursive directory drop traversal.
- [x] **P0-08** Prototype IndexedDB image blob persistence and reload.
- [x] **P0-09** Prototype ZIP archive creation and validation-driven import. Depends on P0-03.
- [x] **P0-10** Record prototype conclusions and finalize technical choices.

## Phase 1: project foundation

- [x] **P1-01** Create Bun package metadata and lockfile.
- [x] **P1-02** Add the HTML, TypeScript, React, and CSS application entry points.
- [x] **P1-03** Configure strict TypeScript based on `../math-game`.
- [x] **P1-04** Configure ESLint, including explicit `any` rejection.
- [x] **P1-05** Add Bun development and production build scripts.
- [x] **P1-06** Configure Bun Test and baseline unit test fixtures.
- [x] **P1-07** Configure Playwright and a Chrome smoke test.
- [x] **P1-08** Add `typecheck`, `lint`, `test`, `test:e2e`, `build`, and `check` scripts.
- [x] **P1-09** Build the CSS-token foundation and desktop editor shell.
- [x] **P1-10** Add startup loading, fatal error, and unsupported-browser states.

## Phase 2: domain model and history

- [x] **P2-01** Implement opaque IDs and immutable project constructors. Depends on P0-02.
- [x] **P2-02** Implement bones, slots, image attachments, point attachments, and rectangle attachments.
- [x] **P2-03** Implement hierarchy and reference validation.
- [x] **P2-04** Implement immutable create, rename, delete, reorder, and reparent operations. Depends on P2-03.
- [x] **P2-05** Implement local affine transform construction. Depends on P0-01.
- [x] **P2-06** Implement local-to-world and world-to-local transforms. Depends on P2-05.
- [x] **P2-07** Implement world-pose-preserving reparenting. Depends on P2-04 and P2-06.
- [x] **P2-08** Implement clips, typed property tracks, and keys.
- [x] **P2-09** Implement stepped and linear interpolation.
- [x] **P2-10** Implement cubic Bezier evaluation and segment metadata.
- [x] **P2-11** Implement discrete attachment, visibility, and draw-order tracks.
- [x] **P2-12** Implement the pure pose evaluator. Depends on P2-02 and P2-08 through P2-11.
- [x] **P2-13** Implement typed project commands and pure command reduction.
- [x] **P2-14** Implement bounded undo/redo history.
- [x] **P2-15** Implement continuous-gesture transaction grouping. Depends on P2-14.
- [x] **P2-16** Add domain, evaluator, validation, and history tests.

## Phase 3: assets, persistence, and archives

- [x] **P3-01** Implement image file validation and decoding for PNG, JPEG, and WebP.
- [x] **P3-02** Implement recursive directory picker import. Depends on P0-07 and P3-01.
- [x] **P3-03** Implement recursive directory drag/drop import. Depends on P0-07 and P3-01.
- [x] **P3-04** Preserve and normalize relative asset folder paths.
- [x] **P3-05** Implement the IndexedDB schema and migrations. Depends on P0-08 and P0-02.
- [x] **P3-06** Implement separate project-metadata and asset-blob repositories.
- [x] **P3-07** Implement debounced autosave after committed commands.
- [x] **P3-08** Add storage persistence requests, quota reporting, and failure handling.
- [x] **P3-09** Implement recent-project listing and crash recovery.
- [x] **P3-10** Implement `.boneanim` export. Depends on P0-09 and P3-06.
- [x] **P3-11** Implement validate-before-replace `.boneanim` import.
- [x] **P3-12** Add repository, autosave, and archive round-trip tests.

## Phase 4: Setup mode

- [x] **P4-01** Implement the folder-based searchable image library.
- [x] **P4-02** Create the PixiJS renderer adapter and lifecycle boundary.
- [x] **P4-03** Render the fixed canvas, grid, setup pose, bones, and attachments.
- [x] **P4-04** Implement viewport pan and zoom.
- [x] **P4-05** Implement viewport, tree, and library selection synchronization.
- [x] **P4-06** Implement click, additive, and marquee multi-selection.
- [x] **P4-07** Implement drag from the library to create image attachments.
- [x] **P4-08** Build bone, slot, and attachment hierarchy editing.
- [x] **P4-09** Implement safe hierarchy drag/reparent and reorder. Depends on P2-07.
- [x] **P4-10** Build translate, rotate, nonuniform scale, and shear handles.
- [x] **P4-11** Implement multi-selection transform deltas.
- [x] **P4-12** Build numeric transform and opacity inspectors.
- [x] **P4-13** Implement fixed pivot editing.
- [x] **P4-14** Implement slot attachment assignment and setup image swapping.
- [x] **P4-15** Implement setup draw-order editing.
- [x] **P4-16** Implement grid spacing, visibility, and snapping controls.
- [x] **P4-17** Connect all setup mutations to history transactions.
- [x] **P4-18** Add Setup-mode browser tests.

## Phase 5: Animate mode

- [x] **P5-01** Implement clip create, duplicate, rename, and delete operations.
- [x] **P5-02** Implement clip FPS, duration, and loop settings.
- [x] **P5-03** Implement frame-accurate playback, pause, stepping, and looping.
- [x] **P5-04** Build playhead scrubbing and timeline frame snapping.
- [x] **P5-05** Build timeline pan, zoom, and row filtering.
- [x] **P5-06** Build dopesheet rows from typed tracks.
- [x] **P5-07** Implement key creation, deletion, copying, and movement.
- [x] **P5-08** Implement multi-key selection and retiming.
- [x] **P5-09** Implement Auto Key, enabled by default.
- [x] **P5-10** Implement edited-but-unkeyed state and explicit key-edited action.
- [x] **P5-11** Add unkeyed, edited, and keyed visual states.
- [x] **P5-12** Implement interpolation selection per segment.
- [x] **P5-13** Build the cubic Bezier graph editor.
- [x] **P5-14** Implement keyed slot attachment swapping.
- [x] **P5-15** Implement keyed draw order.
- [x] **P5-16** Connect all animation mutations to coherent history transactions.
- [x] **P5-17** Add Animate-mode browser tests.

## Phase 6: gameplay metadata

- [x] **P6-01** Define and validate event names and structured payload values.
- [x] **P6-02** Build event-track creation, editing, movement, and deletion.
- [x] **P6-03** Implement point attachment editor visualization and selection.
- [x] **P6-04** Implement keyable point transform and enabled state.
- [x] **P6-05** Implement rectangle attachment editor visualization and handles.
- [x] **P6-06** Implement keyable rectangle transform, size, rotation, and enabled state.
- [x] **P6-07** Evaluate gameplay attachments into world-space sampled-frame data.
- [x] **P6-08** Add event and gameplay attachment tests.

## Phase 7: sprite-sheet export

- [x] **P7-01** Build clip selection and combined/per-clip export controls.
- [x] **P7-02** Implement deterministic clip frame sampling.
- [x] **P7-03** Render sampled poses to transparent fixed-size canvases.
- [x] **P7-04** Implement full-cell grid layout and PNG encoding.
- [x] **P7-05** Generate grid frame and animation JSON.
- [x] **P7-06** Implement transparent-pixel bounds scanning.
- [x] **P7-07** Implement deterministic MaxRects packing with padding.
- [x] **P7-08** Implement multipage splitting at the configured texture limit.
- [x] **P7-09** Implement optional atlas edge extrusion.
- [x] **P7-10** Composite packed atlas pages.
- [x] **P7-11** Generate standard PixiJS frames, animations, and trim metadata.
- [x] **P7-12** Generate companion event and gameplay metadata.
- [x] **P7-13** Package multifile outputs into ZIP downloads.
- [x] **P7-14** Add export progress, batching, browser yielding, and cancellation.
- [x] **P7-15** Build a PixiJS export-validation harness.
- [x] **P7-16** Test grid, packed, combined, per-clip, trimmed, and multipage output.

## Phase 8: hardening and release gate

- [x] **P8-01** Add keyboard shortcuts and a discoverable shortcut reference.
- [x] **P8-02** Add missing-asset, duplicate-name, and invalid-reference diagnostics.
- [x] **P8-03** Add logical-canvas clipping and overflow warnings.
- [x] **P8-04** Add atlas-size, storage-quota, and export-memory diagnostics.
- [x] **P8-05** Add destructive-operation confirmation where history cannot recover data.
- [x] **P8-06** Add a small built-in example project and export fixture.
- [x] **P8-07** Document project and export schemas.
- [x] **P8-08** Document keyboard, project recovery, and PixiJS loading workflows.
- [x] **P8-09** Run desktop layout QA at supported viewport sizes.
- [x] **P8-10** Run the complete clean-checkout regression suite.
- [x] **P8-11** Confirm every `DesignDoc.md` first-release requirement has test evidence.
- [x] **P8-12** Confirm deferred features have not become release blockers.

## Completion commands

```sh
bun install --frozen-lockfile
bun run check
bun run test:e2e
```
