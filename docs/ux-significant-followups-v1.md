# Significant UX follow-up task plan v1

## Objective

Complete the four significant findings from the 2026-09-04 UX review:

1. connect the primary sprite-sheet Export action to a complete, downloadable
   PixiJS output;
2. add viewport presentation presets that separate authoring guides, exported
   pixels, and gameplay metadata;
3. make the Animate timeline adaptive and reduce the controls that displace its
   rows;
4. make the first-run canvas drop target truthful and useful for external image
   drops.

This plan is intended for later implementation. No item is complete merely
because an underlying domain helper exists. A task is complete only when its
implementation, focused unit coverage, browser-visible evidence, and affected
documentation are updated together.

## Current baseline

The reviewed baseline is clean `master` at commit `58b5691`.

- `bun run check` passes, including 313 unit tests, lint, typecheck, and build.
- `bun run test:e2e` passes 127 Chromium tests.
- The editor is bounded to `100dvh`; the side docks and Animate timeline scroll
  independently.
- Setup and Animate use the same project evaluator and immutable command/history
  boundaries.
- Project-scoped presentation preferences are runtime validated and remain
  outside project history, archives, pose evaluation, and exports.
- Export sampling, grid composition, trimming, packing, Pixi atlas metadata,
  gameplay metadata, batching, and ZIP helpers exist, but the toolbar Export
  dialog does not invoke them or download sprite-sheet output.
- Animate currently renders bones and gameplay guides unconditionally.
- The default timeline row mode is `Selection`, even when there is no project
  selection.
- The canvas accepts only an already-imported internal asset drag, although its
  empty-state copy says `Drop image parts here`.

The earlier completed plans remain the regression contract:

- [UX P0 task list](./ux-p0-tasks-v1.md)
- [UX P1 and P2 implementation plan](./ux-p1-p2-tasks-v1.md)
- [UX usability pass](./ux-usability-pass-v1.md)

## Priority and dependency map

```text
UX-F0 export orchestration and real download
  -> UX-F1 export UI, cancellation, and browser proof

UX-V0 viewport presentation model
  -> UX-V1 viewport preset UI and visual proof

UX-T0 adaptive timeline contents
  -> UX-T1 compact timeline controls and layout proof

UX-D0 external-drop routing and import result model
  -> UX-D1 single-image placement and bulk-import handoff

All workstreams
  -> UX-R0 release audit and documentation gate
```

`UX-F0` is the release blocker and should be completed first. After its pure
orchestration boundary is stable, the viewport, timeline, and drop workstreams
may proceed independently. `UX-R0` is last.

## Non-negotiable boundaries

- Continue to use strict TypeScript. Do not add `any`, non-null assertions, or
  type assertions that bypass runtime validation.
- Prefer pure functions, immutable values, function expressions, array methods,
  early returns, and shallow control flow. Do not add classes.
- Project mutations must continue through typed commands and bounded history.
- Export selection, progress, cancellation, viewport presentation, timeline
  presentation, transient notices, and external drag state are UI-only state.
  They must not enter `Project`, `.boneanim` archives, pose evaluation, sampled
  frames, sprite-sheet metadata, or project undo/redo.
- A cancelled or failed export must not download a partial package.
- Export rendering must omit grid, bones, selection guides, transform handles,
  and gameplay guide graphics. Gameplay points, rectangles, and events remain
  present only in companion metadata.
- Viewport presentation presets must not change export output or hit testing
  semantics except where the preset explicitly hides editor-only guides from
  viewport interaction.
- Existing editor-only per-entity visibility remains project scoped and does not
  change exported pixels.
- External import validation and archive replacement safety must not be
  weakened.
- Preserve the supported environment: current desktop Chrome with mouse and
  keyboard input at 1120 x 720, 1280 x 800, 1440 x 900, and 1920 x 1080.
- Keep deferred product features out of scope: IK, constraints, mesh
  deformation, weights, skins/character maps, onion skinning, audio, multiple
  rigs, automatically sized logical bounds, skeletal runtime export, and
  non-Chrome/mobile support.

## Resolved interaction decisions

### Export

- `Export` remains the primary top-toolbar action and means sprite-sheet export,
  not editable `.boneanim` archive export.
- The existing combined/per-clip and clip-selection controls remain.
- A successful export downloads a ZIP package even when the package contains a
  single atlas page. This provides one deterministic browser workflow for grid,
  packed, combined, per-clip, and multipage output.
- The dialog shows idle, rendering, packaging, completed, cancelled, and failed
  states. Progress includes completed and total frames or batches.
- While an export is active, selection and output controls are disabled. Cancel
  remains available, closing the dialog requests cancellation, and no partial
  file is downloaded.
- A retry starts from a fresh run after failure or cancellation.
- Successful completion triggers the download and leaves a concise result
  summary in the open dialog. It does not close the dialog automatically.
- The downloaded name is derived from the project name and ends in `.zip`.

### Viewport presentation

- Add three labelled viewport presets:
  - `Authoring`: images, bones, transform/selection guides, and gameplay guides;
  - `Visual preview`: exported image pixels only;
  - `Gameplay preview`: image pixels plus gameplay point/rectangle guides, with
    bones and transform guides hidden.
- `Authoring` is the default in Setup. The last chosen preset is remembered per
  project across Setup/Animate switches and reloads.
- Selecting `Visual preview` or `Gameplay preview` does not clear the project
  selection. Returning to `Authoring` restores its visible selection and
  transform guides.
- Transform gestures are unavailable while either preview preset is active.
  Navigation, scrubbing, and playback remain available.
- Per-entity visibility remains independent from the preset. Hidden images stay
  hidden in all editor presets, while export remains unaffected.
- Expose the presets as a labelled compact control in the viewport toolbar. Do
  not add another full-height panel.

### Timeline

- Replace the user-facing `Selection` row mode with `Auto`:
  - with no selected timeline-capable entity, show all keyed entity/property
    rows;
  - with one or more selected timeline-capable entities, show their rows plus
    valid pinned rows;
  - asset-only selection behaves like no timeline-capable selection;
  - malformed/stale selection IDs are ignored.
- Keep `All keyed` as an explicit override. Preserve the chosen `Auto` versus
  `All keyed` preference per project.
- The matching-track count reports the tracks represented by the effective
  visible row set, not a larger pre-filter collection.
- Direct selection of a key or event opens its typed Properties context. The
  timeline does not reserve always-visible disabled `Key details` or
  `Event details` buttons.
- Keep clip selection and playback immediately visible. Move advanced track
  creation, pose clipboard actions, and infrequent navigation controls into
  compact labelled menus/popovers where necessary.
- Show `Key edited properties (N)` only while pending edits exist. Auto Key
  remains directly visible.
- At 1120 x 720 and the default 260 px timeline height, the ruler plus at least
  three applicable data rows must be visible without scrolling when that many
  rows exist.
- Existing key selection, marquee, retiming, copy/paste, deletion, nudge,
  pinning, seeking, events, and keyboard behavior remain unchanged.

### First-run and external drop

- The empty canvas must distinguish an OS file/folder drop from an internal
  Assets drag.
- Dropping one supported external image file onto the canvas imports it and
  places it at the logical drop point in one project-history transaction. An
  empty project receives its root bone, slot, and image attachment in that same
  transaction.
- Dropping multiple files or a folder onto the canvas imports valid images into
  Assets but does not place attachments. The Assets tab opens, the imported
  assets are selected when practical, and a persistent result explains that
  explicit placement is required.
- Bulk drops must not invent overlap, cascade, or layout positions when source
  position metadata is unavailable.
- Unsupported, duplicate, invalid, skipped, and conflicting inputs use the same
  import validation and summary semantics as the Assets drop target.
- The canvas empty state offers `Import image directory`, `Open recent`, and
  `Load example` actions alongside truthful drag guidance. These actions reuse
  existing project/import paths rather than duplicating logic.
- After assets exist but no rig exists, the canvas guidance explains that an
  asset can be dragged from Assets to create the root, slot, and attachment.

## UX-F0: export orchestration

- [x] **UX-F0-01** Characterize the current export seam. Add focused tests that
  prove the Export dialog currently exposes clip selection and diagnostics but
  has no run/download action. Record the existing output matrix for grid versus
  packed, combined versus per-clip, trimming, padding/extrusion, multipage
  output, animation JSON, and gameplay metadata. Do not weaken existing export
  unit coverage.

- [x] **UX-F0-02** Define a pure typed export orchestration contract. Depends on
  UX-F0-01. Add request, progress, file-result, cancellation, and structured
  error types that accept a validated project, selected clip IDs, output mode,
  assets, and an injected frame-rendering boundary. Normalize selected clips
  once before work begins. Reject invalid configuration atomically and return no
  partial files.

- [x] **UX-F0-03** Add an export frame capture adapter. Depends on UX-F0-02.
  Render every sampled pose at logical-canvas resolution through the same Pixi
  scene/evaluator contract used by the viewport, with all authoring overlays
  disabled. Return validated RGBA frames suitable for grid composition and
  trimming. Reuse renderer/image resources across a run and always release them
  on success, failure, or cancellation.

- [x] **UX-F0-04** Compose complete grid output through the orchestrator.
  Depends on UX-F0-03. Produce PNG atlas pages, Pixi atlas JSON, ordered
  `animations.json`, and frame-aligned `boneanim-metadata.json` for combined and
  per-clip selection. Preserve full logical-canvas cells and deterministic frame
  keys. Add tests using actual rendered example frames rather than only
  synthetic RGBA fixtures.

- [x] **UX-F0-05** Compose complete packed output through the orchestrator.
  Depends on UX-F0-03. Scan alpha bounds, trim, pack deterministically, preserve
  source offsets, apply padding/extrusion, support multiple pages, and produce
  the same animation/metadata contracts as grid output. Fully transparent and
  oversized frames must report actionable typed errors without partial output.

- [x] **UX-F0-06** Package deterministic download results. Depends on UX-F0-04
  and UX-F0-05. Build safe file paths for combined and per-clip groups, reject
  duplicates before packaging, produce one ZIP blob, and derive a stable safe
  filename from the project name. Verify ZIP contents and deterministic ordering
  in unit tests.

- [x] **UX-F0-07** Integrate bounded progress and cancellation. Depends on
  UX-F0-04 through UX-F0-06. Use the existing batching/yield boundary so long
  exports keep the UI responsive. Check the abort signal between batches and
  expensive phases. Report progress monotonically and never call the packaging
  or download boundary after cancellation or failure.

## UX-F1: export UI and browser proof

- [x] **UX-F1-01** Replace the placeholder export status with explicit run
  controls. Depends on UX-F0-07. Add `Export ZIP`, `Cancel`, and `Retry` states
  to the existing dialog. Disable run when diagnostics contain errors or no
  clips are selected. Keep warnings visible but non-blocking. Announce progress,
  cancellation, failure, and completion through accessible status regions.

- [x] **UX-F1-02** Add safe browser download lifecycle handling. Depends on
  UX-F1-01. Create and revoke the object URL at the adapter boundary. Start
  exactly one download per successful user request. Closing/unmounting aborts
  active work and revokes retained URLs. A retry cannot download a stale prior
  result.

- [x] **UX-F1-03** Add focused export browser coverage. Depends on UX-F1-02.
  Export the built-in example in combined grid, per-clip grid, combined packed,
  and a forced multipage packed case. Inspect the downloaded ZIP, verify required
  files and selected clips, decode PNG dimensions, and reload every atlas page
  through PixiJS. Assert that visual frames exclude bones, grid, selection, and
  gameplay guide pixels while metadata retains gameplay geometry and events.

- [x] **UX-F1-04** Cover cancellation and failures in Chromium. Depends on
  UX-F1-02. Inject a controllable slow renderer and failures at render,
  composition, packaging, and download boundaries. Verify visible recovery,
  focus behavior, no partial download, and a successful later retry.

- [x] **UX-F1-05** Reconcile release documentation. Depends on UX-F1-03 and
  UX-F1-04. Update the export, release-workflow, first-release-evidence, and
  regression documents so they distinguish domain/unit proof from the complete
  user-visible download workflow. Remove all placeholder language only after
  end-to-end export passes.

## UX-V0: viewport presentation model

- [x] **UX-V0-01** Add a pure viewport-preset model. Define the three presets,
  their labels, renderer flags, guide/handle visibility, and transform-enabled
  state. Unit test every Setup/Animate combination without branching the renderer
  directly on UI labels.

- [x] **UX-V0-02** Extend runtime-validated UI preferences. Depends on UX-V0-01.
  Add the selected preset to project-scoped presentation preferences with a safe
  migration/default for old, missing, malformed, and stale storage. Verify it
  remains outside project history, archives, sampled frames, and export output.

- [x] **UX-V0-03** Route presets through the viewport renderer. Depends on
  UX-V0-01. Stop unconditionally enabling bones and gameplay guides in Animate.
  Derive `showBones`, `showGameplay`, selection guides, and transform handles
  from the preset. Preserve grid behavior in Authoring while Visual preview
  remains pixel-clean.

- [x] **UX-V0-04** Gate editing without losing context. Depends on UX-V0-03.
  Disable transform gesture start in preview presets, cancel a gesture if the
  preset changes mid-gesture, preserve selection, and restore authoring handles
  when Authoring returns. Do not disable pan, zoom, fit, scrubbing, playback, or
  tree/inspector selection.

## UX-V1: viewport preset UI and proof

- [x] **UX-V1-01** Add the compact labelled preset control. Depends on UX-V0-04.
  Place it in the existing viewport toolbar with accessible pressed/selected
  state and concise tooltips. It must not collide with canvas size, warnings,
  transform tools, grid settings, or zoom controls at supported viewports.

- [x] **UX-V1-02** Add screenshot-based preset coverage. Depends on UX-V1-01.
  Capture the example at a keyed Animate frame in all three presets. Assert that
  Visual preview contains the same image pixels as an export capture; Authoring
  adds bones/selection guides; Gameplay preview adds point/rectangle guides but
  not bones. Do not infer visual behavior solely from DOM state.

- [x] **UX-V1-03** Cover persistence and interaction boundaries. Depends on
  UX-V1-01. Verify project isolation, reload restoration, malformed preference
  fallback, mode switching, playback, navigation, selection preservation,
  gesture cancellation, and that preset changes create no project-history entry.

- [x] **UX-V1-04** Document the viewport presets. Depends on UX-V1-02 and
  UX-V1-03. Update viewport, visibility, keyboard/help, and release workflow docs
  with the distinction between authoring visibility, preview presentation, and
  exported output.

## UX-T0: adaptive timeline contents

- [x] **UX-T0-01** Characterize the misleading empty-selection state. Add a
  browser test that loads the example, enters Animate with no selection, and
  records that keyed tracks exist even though Selection mode initially exposes
  no entity/property rows. Preserve this as a failing requirement test before
  changing the model.

- [x] **UX-T0-02** Add a pure effective-row-mode resolver. Depends on UX-T0-01.
  Given the stored `Auto`/`All keyed` preference, current selection, valid pins,
  project, and active clip, derive the effective entity IDs and grouped rows.
  Cover no selection, asset-only selection, mixed selection, multi-entity
  selection, stale IDs, pins, malformed targets, and zero keyed tracks.

- [x] **UX-T0-03** Migrate the stored timeline preference. Depends on UX-T0-02.
  Treat legacy `selection` as `auto`, preserve `all-keyed`, and reject all other
  persisted values. Do not alter project data or selection history.

- [x] **UX-T0-04** Make counts and empty states describe visible content.
  Depends on UX-T0-02. The matching-track count must match effective property
  rows. When Auto has no applicable keys, explain whether the clip is empty or
  the current selected entities have no keyed properties and offer the relevant
  next action.

- [x] **UX-T0-05** Preserve pin and synchronization behavior. Depends on
  UX-T0-02. Pins augment Auto selection rows, selecting a row synchronizes the
  Rig/canvas/Properties selection, clearing selection falls back to all keyed,
  and direct marker interaction continues to select/seek without feedback loops.

## UX-T1: compact timeline controls and layout proof

- [x] **UX-T1-01** Define a compact two-row control layout. Keep clip tabs and
  clip creation in the first row. Keep step/play/frame readout, Auto Key, and
  pending-key action in the second row. Put track creation, pose clipboard,
  filter options, and timeline pan/zoom actions into labelled compact
  menus/popovers without removing keyboard shortcuts.

- [x] **UX-T1-02** Remove permanently reserved inapplicable actions. Depends on
  UX-T1-01. Selecting a key or event opens the typed Properties context directly.
  Remove always-visible disabled Key/Event detail buttons. Show the pending-key
  action only when its count is positive. Retain accessible discovery through
  contextual menus, tooltips, and the shortcut reference.

- [x] **UX-T1-03** Preserve direct timeline manipulation. Depends on UX-T1-01.
  Re-run and extend browser coverage for ruler/lane seeking, marker hit targets,
  row selection, marquee selection, whole-frame retiming, copy/paste, delete,
  nudge, events, pinning, playhead updates, and shortcut isolation while menus or
  fields are focused.

- [x] **UX-T1-04** Add a visible-row layout gate. Depends on UX-T1-01 and
  UX-T1-02. At every supported viewport and the default/minimum timeline height,
  assert document containment, sticky alignment, scroll independence, and the
  minimum visible-row requirement. Include screenshots at 1120 x 720 and 1440 x
  900 with no selection, one selected bone, and All keyed override.

- [x] **UX-T1-05** Update timeline documentation. Depends on UX-T1-03 and
  UX-T1-04. Document Auto behavior, All keyed override, pins, contextual detail
  routing, compact menus, empty states, and all retained shortcuts.

## UX-D0: external-drop routing and import results

- [x] **UX-D0-01** Characterize every current drop source and target. Cover OS
  single files, multiple files, folders, internal asset rows, slots, the Assets
  panel, canvas pasteboard, canvas bounds, and viewport controls. Record the
  current no-op when an external file is dropped on the canvas and retain
  existing internal asset/slot behavior.

- [x] **UX-D0-02** Extract and reuse a typed external-drop classifier. Depends on
  UX-D0-01. Distinguish an internal asset ID from external files/folders without
  relying on UI text. Convert browser `DataTransferItem` values at one validated
  adapter boundary and return a pure route: internal placement, single external
  import-and-place, bulk external import, unsupported, or empty.

- [x] **UX-D0-03** Add a pure single-image import-and-place planner. Depends on
  UX-D0-02. Given a validated imported image, logical drop point, project, and
  current bone selection, produce one immutable command transaction. Reuse the
  current internal-drop rules: create root when absent, otherwise require a
  selected bone, then create the slot and attachment at the correct bone-local
  point. Allocate IDs once and reject stale/invalid targets without mutation.

- [x] **UX-D0-04** Add a bulk-import result model. Depends on UX-D0-02. For
  multiple files or a folder dropped on the canvas, import only into Assets.
  Return imported, skipped, conflicting, invalid, and unsupported entries plus
  the IDs eligible for reveal/selection. Do not emit attachment placement
  commands.

## UX-D1: external-drop UI and first-run proof

- [x] **UX-D1-01** Accept external drops on the canvas. Depends on UX-D0-03 and
  UX-D0-04. Provide a distinct drag-over treatment for single-image placement
  and bulk import. Prevent default browser navigation only for supported drop
  candidates. Keep viewport controls excluded from placement.

- [x] **UX-D1-02** Complete the single-image workflow. Depends on UX-D1-01.
  Show importing feedback, validate/decode the image, commit import and placement
  as one undo entry and one autosave snapshot, select/reveal the new attachment,
  and show a concise success summary. If placement fails after validation, leave
  project and asset blobs unchanged.

- [x] **UX-D1-03** Complete the bulk-import handoff. Depends on UX-D1-01. Import
  valid assets in one command, switch/reveal the Assets tab, select the imported
  entries when the selection model supports it, and show explicit guidance that
  images must be placed from Assets. Undo removes the whole import. No slot or
  attachment is created automatically.

- [x] **UX-D1-04** Replace the empty-canvas guidance. Depends on UX-D1-02 and
  UX-D1-03. Add direct actions for importing a directory, opening recent work,
  and loading the example. Use copy that accurately differentiates external
  import from dragging an imported asset into the rig. Keep the central state
  compact and remove it as soon as project content makes it irrelevant.

- [x] **UX-D1-05** Add failure, focus, and accessibility coverage. Depends on
  UX-D1-02 through UX-D1-04. Cover unsupported-only drops, mixed valid/invalid
  input, duplicate paths, decode failures, a missing selected bone, root
  auto-creation, bulk import without placement, keyboard operation of all empty
  actions, status announcements, undo/redo, autosave, and reload recovery.

- [x] **UX-D1-06** Update import and first-run documentation. Depends on
  UX-D1-05. Document external canvas drops, bulk-import handoff, internal asset
  placement, root creation, selected-bone requirements, conflict summaries, and
  the fact that browser-owned source handles are not retained.

## UX-R0: final release audit

- [x] **UX-R0-01** Run the complete regression gate after all workstreams are
  merged. Run `git diff --check`, `bun run check`, and `bun run test:e2e` from a
  clean `master` worktree. Record current test counts and resolve all warnings or
  failures rather than documenting them as acceptable.

- [x] **UX-R0-02** Perform the final visible workflow pass. Depends on UX-R0-01.
  At 1120 x 720 and 1440 x 900, verify the empty start, external single-image
  drop, external folder import, internal placement, Setup authoring, Animate
  Auto timeline, all three viewport presets, playback, actual ZIP export, cancel,
  retry, and reload recovery. Capture screenshots of representative states and
  inspect the Pixi canvas rather than relying on DOM assertions alone.

- [x] **UX-R0-03** Audit serialization and history boundaries. Depends on
  UX-R0-01. Compare `.boneanim` archives, sampled poses, sprite-sheet files,
  project history, and autosave records before and after changing viewport
  presets, timeline modes, open menus, export state, and transient drop state.
  Only intended import/placement commands may change project data.

- [x] **UX-R0-04** Reconcile task and release claims. Depends on UX-R0-02 and
  UX-R0-03. Check off tasks only with requirement-level evidence. Update the
  release evidence so `Export` means a verified user download, not merely tested
  lower-level output helpers. Record the implementation commit and final
  validation counts in this document.

## Acceptance matrix

| Workflow | Required result |
| --- | --- |
| Export example | Clicking `Export ZIP` downloads a complete PixiJS package with image, atlas, animation, and gameplay metadata files. |
| Export failure | The dialog reports the failed phase, downloads nothing, and permits a clean retry. |
| Export cancellation | Work stops at a safe boundary, downloads nothing, and releases renderer/object-URL resources. |
| Visual preview | The viewport shows only pixels that belong in the sprite sheet while preserving navigation and playback. |
| Gameplay preview | The viewport shows final image pixels plus metadata guides, without bone clutter. |
| Authoring return | Selection and applicable transform handles return without a project mutation. |
| Timeline with no selection | Auto shows all keyed rows and reports the visible track count. |
| Timeline with selection | Auto shows selected and pinned rows while retaining direct key editing. |
| Minimum layout | At least three applicable data rows plus the ruler are visible at the default timeline height. |
| Single external image drop | The image is imported and placed in one undoable transaction at the logical drop point. |
| Folder or multi-file canvas drop | Valid images enter Assets, no attachments are placed, and the user receives explicit placement guidance. |
| Regression boundary | Existing rig, keying, draw-order, event, persistence, archive, and viewport workflows remain green. |

## Completion record

Complete this section only after every checked task has current evidence.

- Implementation commit: `73671f7` (from `3cad3f8` through `73671f7`)
- Documentation commits: `78c9a77`, `f09f43d`, and this commit
- `bun run check`: passed, 352 unit tests plus lint/typecheck/build
- `bun run test:e2e`: passed, 152 Chromium tests
- `git diff --check`: passed
- Visible review artifacts: `/tmp/bone-animation-v1-{1120,1440}-{authoring,visual-preview,gameplay-preview}.png`, `/tmp/bone-animation-timeline-*.png`
