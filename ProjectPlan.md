# Project Plan

## Outcome

Deliver a reliable Chrome-based editor that imports image parts, builds a rigid bone rig, authors multiple animation clips, recovers work locally, and exports grid or packed sprite sheets that load correctly in PixiJS.

The implementation should progress through vertical, verifiable increments. Rendering, pose evaluation, and export must share one domain evaluator so the viewport cannot silently diverge from exported frames.

## Technical direction

### Toolchain

- Bun development server and `Bun.build` with an HTML entry point.
- Strict TypeScript with the `../math-game` compiler and script conventions as a baseline.
- ESLint, Bun Test, and Playwright.
- React for editor panels, hierarchy, inspectors, and timeline UI.
- PixiJS 8 for viewport and export rendering.
- Plain CSS with application design tokens and CSS Grid for the editor workspace.
- `idb` for promise-based IndexedDB access.
- `fflate` for project and export ZIP archives.
- Valibot for project schema and archive validation.

Dependency versions should be selected and locked during scaffolding after confirming their current Bun and Chrome compatibility.

### Application boundaries

```text
React editor shell
├── immutable editor store
│   ├── saved project state
│   ├── transient session state
│   └── undo/redo history
├── pure animation domain
│   ├── project validation
│   ├── transform evaluation
│   ├── interpolation
│   └── pose sampling
├── PixiJS rendering adapter
├── IndexedDB project repository
├── archive import/export service
└── sprite-sheet export pipeline
```

The animation domain must not import React, PixiJS, IndexedDB, or browser UI modules. Its central operation should evaluate a project and clip at a time into a renderer-neutral pose.

### State model

Saved project state contains the asset catalog, setup rig, clips, export settings, and schema version. Session state contains selection, active tools, viewport state, playhead, panel layout, and uncommitted gesture previews.

All saved-state mutations pass through typed commands and pure reducers. Undo/redo stores bounded immutable project snapshots with transaction grouping. Asset blobs live outside history; garbage collection occurs only when an asset is unreachable from the current project and retained history.

### Persistence and files

IndexedDB stores project metadata separately from image blobs. Autosave follows committed commands and is debounced. The application requests persistent browser storage when available and reports storage failures rather than silently losing work.

The project archive uses a custom `.boneanim` extension over ZIP:

```text
manifest.json
project.json
assets/<asset-id>.<extension>
```

Every archive includes a schema version. Imports are decoded and validated completely before the active project is replaced.

### Export model

The exporter samples each selected clip at its configured FPS through the same pose evaluator used by preview. PixiJS renders every sample to the project's fixed logical canvas.

- Grid output retains the entire logical canvas in every cell.
- Packed output finds the nontransparent physical bounds of each frame, packs those regions, and records logical source size and trim offsets.
- A deterministic pure MaxRects implementation performs packing with padding and optional edge extrusion.
- Output is divided into pages at a default maximum of 4096 by 4096 pixels.
- Standard PixiJS JSON remains separate from a companion metadata document containing events and gameplay geometry.

## Editor workspace

- Top toolbar: project actions, history, Setup/Animate mode, grid, playback, and export.
- Left panel: searchable image library retaining imported folders.
- Center: PixiJS viewport, canvas bounds, grid, rig, selection, and transform controls.
- Right panel: rig hierarchy and context-sensitive inspector.
- Bottom panel: clip selector, playback controls, dopesheet, event tracks, and Bezier editor.

## Delivery phases

### Phase 0: specification and risk prototypes

Finalize coordinate conventions, transform order, archive schema, and metadata schemas. Prove fixed-frame rendering, alpha trimming, PixiJS atlas reload, Chrome directory traversal, IndexedDB blob recovery, and ZIP round-tripping before building the full UI.

Exit gate: a two-frame generated atlas reloads through PixiJS with both frames aligned to their original logical canvas origin.

### Phase 1: foundation

Scaffold the Bun/TypeScript/React application, build pipeline, linting, unit tests, browser tests, CSS tokens, fatal-error handling, and editor shell.

Exit gate: `bun run check` passes and an empty editor opens in Chrome.

### Phase 2: domain and history

Implement the versioned project model, entity operations, hierarchy validation, affine transforms, clip tracks, interpolation, pose evaluation, command transactions, and undo/redo.

Exit gate: fixture clips evaluate deterministically without React or PixiJS.

### Phase 3: assets and persistence

Implement recursive image import, asset decoding, IndexedDB storage, autosave, recent-project recovery, and `.boneanim` archive import/export.

Exit gate: an exported project can be removed locally, reimported, and recovered with equivalent data and images.

### Phase 4: Setup mode

Implement the library, viewport, rig construction, hierarchy editing, selection, transforms, pivots, attachment management, setup draw order, grid, snapping, and inspectors.

Exit gate: a complete rigid rig can be built, saved, reloaded, and edited with coherent undo/redo.

### Phase 5: Animate mode

Implement clip management, timeline, dopesheet, playback, key editing, Auto Key, explicit keying, attachment and draw-order keys, and interpolation controls.

Exit gate: multiple clips can be authored, previewed, retimed, archived, and restored.

### Phase 6: gameplay metadata

Implement event tracks, point attachments, rectangles, keyable gameplay properties, editor visualization, and world-space sampling.

Exit gate: a clip produces correct frame-indexed events, points, hitboxes, and hurtboxes.

### Phase 7: sprite-sheet export

Implement clip selection, frame sampling, grid output, alpha trimming, atlas packing, multipage output, PixiJS JSON, companion metadata, progress, cancellation, and ZIP download.

Exit gate: every export mode loads into a PixiJS test harness and preserves animation alignment and gameplay metadata.

### Phase 8: hardening

Add keyboard shortcuts, diagnostics, storage and canvas overflow warnings, performance controls, example content, schema documentation, and end-to-end regression coverage.

Exit gate: all definition-of-done requirements pass on a clean checkout.

## Testing strategy

### Unit and integration tests

- Affine transform composition and inversion.
- World-pose-preserving reparenting.
- Hierarchy cycle and dangling-reference detection.
- Stepped, linear, and cubic Bezier interpolation.
- Rotation across angle boundaries.
- Clip looping and frame sampling.
- Discrete attachment and draw-order tracks.
- History transaction grouping.
- Schema validation and migration.
- IndexedDB repository operations.
- Archive round-trip integrity.
- Alpha bounds, atlas packing, and trim metadata.
- PixiJS and companion metadata generation.

### Browser tests

- Directory and drag/drop import.
- Rig construction and hierarchy editing.
- Single- and multi-selection transforms.
- Setup and Animate mode separation.
- Auto Key enabled and disabled workflows.
- Timeline key manipulation and playback.
- Undo/redo through all major workflows.
- Autosave recovery after reload.
- Project archive round-trip.
- Grid, packed, combined, and per-clip export.
- Loading exported content in a PixiJS fixture.

## Principal risks and controls

- Transform discrepancies: use one pure pose evaluator for preview and export.
- History corruption: require commands for all saved mutations and test gesture grouping.
- Data loss: autosave only validated snapshots, retain previous recovery data, and validate archives before replacement.
- Browser storage quotas: report estimates and failures, request persistence, and keep explicit archives prominent.
- Large export stalls: batch rendering, yield to the browser, move packing and compression to workers where practical, and support cancellation.
- GPU texture limits: use a conservative page limit and multipage atlases.
- Scope growth: enforce the deferred-feature list until the first-release completion gate passes.

## Definition of done

- All first-release requirements in `DesignDoc.md` are implemented.
- No deferred feature is required to complete a supported workflow.
- No `any` or non-null assertion is used to bypass TypeScript.
- Persisted and imported data is runtime validated.
- Preview and exported frames use the same evaluated pose.
- Undo/redo covers every project mutation and groups continuous gestures.
- Autosave recovery and self-contained archive round trips pass.
- All four export combinations pass: grid or packed, combined or per clip.
- PixiJS consumes the generated standard atlas metadata.
- Companion metadata matches sampled frames.
- `bun run check` and `bun run test:e2e` pass on a clean checkout.
