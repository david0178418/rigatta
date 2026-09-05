# Rigatta architecture

## System shape

```text
React editor shell
├── project history and transient editor state
├── pure animation domain
│   ├── project operations and validation
│   ├── affine transforms and interpolation
│   ├── animation tracks and playback
│   └── pose and gameplay evaluation
├── PixiJS viewport and fixed-canvas renderer
├── IndexedDB project repository
├── .rigatta archive service
└── sprite-sheet export pipeline
```

The application is built from a Bun HTML entry point and React 19. The editor UI is rendered by React, while PixiJS 8 owns the canvas renderer used by the viewport and frame capture. Plain CSS defines the desktop workspace and its resizable docks and timeline.

## Module boundaries

`src/domain` contains renderer-neutral project types, validation, immutable operations, commands, history, transforms, interpolation, playback, and pose evaluation. It does not depend on React, PixiJS, IndexedDB, or browser UI components.

`src/app` contains the React editor, presentation state, selection, workspace layout, input gestures, hierarchy and timeline view models, and UI components. `App.tsx` currently composes the editor and coordinates domain, persistence, rendering, asset, and export services.

`src/assets` validates and decodes supported images, traverses directory and drop inputs, and plans asset imports.

`src/rendering` adapts evaluated poses and browser image blobs to PixiJS. Rendering code consumes domain results; it does not own animation rules.

`src/persistence` owns the IndexedDB schema and repository, debounced autosave, startup recovery, browser-storage diagnostics, runtime project decoding, and `.rigatta` archive import and export.

`src/export` owns deterministic frame selection, capture orchestration, trimming, packing, atlas composition, PNG encoding, PixiJS metadata, companion metadata, ZIP packaging, progress, cancellation, and validation.

`src/examples` contains the built-in project and its in-memory image assets.

## State ownership

Versioned project state contains:

- Project identity, name, and logical canvas size.
- Image asset metadata.
- Bones, slots, attachments, setup order, and draw order.
- Animation clips, tracks, keys, and events.
- Sprite-sheet export settings.

Project changes are represented by typed commands and immutable operations. `HistoryState` retains bounded project snapshots and supports transactions so a continuous gesture produces one undo entry.

Image blobs are held separately from project JSON and history snapshots. They are stored alongside project and recovery records in IndexedDB and embedded in exported project archives.

Transient editor state includes selection, active tools, grid state, playhead and playback, pending Auto Key edits, active gestures, import and export progress, and open contextual surfaces. Per-project presentation preferences—including dock dimensions and tabs, hidden entities, viewport preset, timeline organization, and selection history—are stored separately in versioned local-storage data. Presentation preferences are excluded from `.rigatta` files.

## Validation boundary

The TypeScript types describe trusted in-memory state. Data entering from project archives, IndexedDB, local storage, files, and browser APIs is checked at runtime before use.

Valibot validates the serialized project and archive manifest shape. Domain validation then checks semantic constraints such as unique IDs, hierarchy validity, references, orders, clip values, tracks, and keys. Image imports and archive assets also validate MIME type, encoded dimensions, declared byte length, and archive hashes.

An archive import is decoded and validated completely before the active editor project is replaced.

## Pose and rendering invariant

`evaluatePose(project, clipId, timeSeconds, overrides)` is the central animation operation. It resolves interpolated local values, bone world matrices, active slot attachments, attachment poses, and effective draw order into a renderer-neutral result. Gameplay points and rectangles are derived from that evaluated pose.

The editor viewport evaluates the active clip through this operation. Export samples every requested frame through the same operation before passing the pose to fixed-canvas rendering. This shared boundary is the primary control against preview and export transform drift.

## Persistence model

IndexedDB database `rigatta-projects`, currently at version 1, contains separate stores for projects, image assets, and recovery snapshots. Autosave schedules repository writes after committed project changes and reports scheduled, saving, saved, and error states to the UI.

The archive format is a ZIP with a `.rigatta` extension. Its version 1 manifest identifies the version 1 project document and every included asset. Assets use stable entity-ID filenames inside the archive.

UI preferences use the versioned `rigatta.ui-preferences.v2` local-storage key. They can be discarded or normalized independently of saved project content.

## Export pipeline

Export proceeds through validation, frame planning, rendering, composition, and packaging:

```text
selected clips
→ deterministic frame samples at each clip FPS
→ shared pose and gameplay evaluation
→ fixed logical-canvas RGBA capture
→ grid layout or alpha trim and MaxRects packing
→ PNG pages and PixiJS atlas JSON
→ companion gameplay metadata
→ combined or per-clip ZIP package
```

Grid pages preserve the full logical canvas for each cell. Packed pages store only nontransparent regions while retaining original logical size and trim offsets in PixiJS metadata. Both modes can create multiple pages when the configured texture limit requires it. Packaging is all-or-nothing: failures and cancellation do not intentionally download partial output.

## Architectural constraints

- Keep animation evaluation independent of rendering and UI frameworks.
- Use the shared pose evaluator for both preview and exported frames.
- Route saved project changes through typed immutable operations and history transactions.
- Keep project data, image blobs, and presentation preferences separate.
- Runtime-validate persisted and externally supplied data before it enters trusted state.
- Preserve deterministic sampling, packing, naming, and metadata generation so exports are reproducible.
- Report persistence, rendering, and export failures rather than silently discarding work or emitting partial files.
