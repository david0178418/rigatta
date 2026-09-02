# First-release evidence v1

This audit maps every supported-environment, rig, asset, setup, animation,
gameplay, persistence, and export requirement in `DesignDoc.md` to executable
evidence. Unit and integration tests exercise pure domain and export behavior;
Playwright tests exercise the supported Chrome editor workflow.

## Environment and project shape

| Requirement | Evidence |
| --- | --- |
| Desktop Chrome, mouse, and keyboard input | `tests/e2e/layout.spec.ts` checks the three supported desktop sizes; `tests/e2e/smoke.spec.ts` covers mouse workflows and the keyboard shortcut flow. |
| Local, single-user operation with one rig and multiple clips | `tests/unit/repository.test.ts` and `tests/unit/startup.test.ts` exercise local persistence and recovery; `tests/unit/validation.test.ts` enforces the single-root shape; the clip lifecycle test in `tests/e2e/smoke.spec.ts` creates and duplicates clips. |

## Rig and setup

| Requirement | Evidence |
| --- | --- |
| One root with descendant bones | `tests/unit/validation.test.ts` covers roots, cycles, and dangling parents; `tests/unit/operations.test.ts` covers root and child creation. |
| Bone translation, rotation, nonuniform scale, and shear | `tests/unit/coordinates.test.ts` and `tests/unit/transform-gesture.test.ts` cover affine values and all setup tools. |
| Slots with independently keyable draw order | `tests/unit/animation.test.ts` covers draw-order keys; `tests/unit/slot-dnd.test.ts` and the slot reorder flow in `tests/e2e/smoke.spec.ts` cover setup and keyed ordering. |
| Multiple image attachments with one active slot attachment | `tests/unit/operations.test.ts` covers assignment and reference rejection; the image import and attachment-swap flow in `tests/e2e/smoke.spec.ts` covers the browser path. |
| Image local transforms, opacity, and fixed pivots | `tests/unit/operations.test.ts` covers transform and image-property updates; `tests/unit/pose-images.test.ts` covers setup and evaluated image instances. |
| Named point and rectangle gameplay attachments | `tests/unit/operations.test.ts` creates both attachment kinds; the gameplay guide and keying flows in `tests/e2e/smoke.spec.ts` exercise them. |
| Separate Setup and Animate modes | The setup, animation, and gameplay flows in `tests/e2e/smoke.spec.ts` switch modes and verify mode-specific controls. |
| Rigid forward-kinematic animation | `tests/unit/transforms.test.ts`, `tests/unit/pose.test.ts`, and `tests/unit/sampling.test.ts` cover world evaluation, keyed poses, and deterministic sampled frames. |
| Setup creation, rename, delete, reparent, and reorder | `tests/unit/operations.test.ts` covers immutable operations; the hierarchy inspector and drag/drop flows in `tests/e2e/smoke.spec.ts` cover the browser interactions and destructive confirmation. |
| Grid visibility, spacing, and snapping | `tests/unit/viewport.test.ts` and `tests/e2e/smoke.spec.ts` cover grid controls and viewport state. |
| Cycle and dangling-reference prevention | `tests/unit/validation.test.ts` and `tests/unit/operations.test.ts` cover invalid parents, cycles, missing references, and dependent deletes. |

## Assets

| Requirement | Evidence |
| --- | --- |
| Directory picker and directory drag/drop import | `tests/unit/import.test.ts` covers recursive handles and dropped files; the import browser flow is in `tests/e2e/smoke.spec.ts`. |
| Preserve relative folders in the library | `tests/unit/import.test.ts` and `tests/unit/asset-library.test.ts` cover path traversal and deterministic folder entries. |
| PNG, JPEG, and WebP support | `tests/unit/images.test.ts` covers supported signatures, dimensions, and MIME validation. |
| Copy source images into local project storage | `tests/unit/repository.test.ts` covers separate image-blob persistence; `tests/unit/archive.test.ts` covers self-contained archive bytes. |
| Drag library images into the viewport to create parts | The import-and-drop browser flow in `tests/e2e/smoke.spec.ts` creates a slot and image attachment from library assets. |

## Animation authoring

| Requirement | Evidence |
| --- | --- |
| Create, name, duplicate, and configure multiple clips | `tests/unit/animation.test.ts` covers clip operations; the clip lifecycle flow in `tests/e2e/smoke.spec.ts` covers create, duplicate, rename, duration, FPS, and loop settings. |
| Scrub, play, pause, step, and loop clips | `tests/unit/playback.test.ts` covers frame-accurate state transitions; the playback and playhead flows in `tests/e2e/smoke.spec.ts` cover controls. |
| Create, select, copy, move, delete, and retime timeline keys | `tests/unit/animation.test.ts` and `tests/unit/animation-history.test.ts` cover immutable key operations and grouped deletion; the typed-key and retiming flows in `tests/e2e/smoke.spec.ts` cover the timeline. |
| Key bone and image-part transforms and opacity | `tests/unit/animation.test.ts` and `tests/unit/pose.test.ts` cover typed tracks and evaluation; the Auto Key and image-part flows in `tests/e2e/smoke.spec.ts` cover editing. |
| Key active attachments and slot draw order | `tests/unit/animation.test.ts` covers both discrete track kinds; the attachment and slot-order browser flows in `tests/e2e/smoke.spec.ts` cover UI editing. |
| Stepped, linear, and editable cubic Bezier interpolation | `tests/unit/interpolation.test.ts` covers evaluation; the interpolation and Bezier editor flow in `tests/e2e/smoke.spec.ts` covers selection and editing. |
| Discrete attachment, draw-order, enabled, and event values | `tests/unit/animation.test.ts`, `tests/unit/event-operations.test.ts`, and `tests/unit/pose.test.ts` cover typed values and evaluation. |
| Auto Key enabled by default and explicit keying when disabled | The Auto Key enabled, disabled, and property-state flows in `tests/e2e/smoke.spec.ts` cover both paths. |
| Distinguish unkeyed, pending, and keyed properties | The property-state flow in `tests/e2e/smoke.spec.ts` asserts all three visible states. |

## Gameplay metadata

| Requirement | Evidence |
| --- | --- |
| Named events with bounded structured payloads | `tests/unit/events.test.ts` and `tests/unit/event-operations.test.ts` cover validation and immutable event editing; the event browser flow is in `tests/e2e/smoke.spec.ts`. |
| Point attachments for gameplay locations | `tests/unit/pose.test.ts` and `tests/unit/metadata.test.ts` cover point evaluation and exported frame metadata; the point setup/keying flow is in `tests/e2e/smoke.spec.ts`. |
| Rectangle attachments for hitboxes and hurtboxes | `tests/unit/transform-gesture.test.ts`, `tests/unit/pose.test.ts`, and `tests/unit/metadata.test.ts` cover size, world geometry, and metadata; the rectangle browser flow is in `tests/e2e/smoke.spec.ts`. |
| Key gameplay transforms, enabled state, dimensions, and rotation | `tests/unit/animation.test.ts` and `tests/unit/pose.test.ts` cover typed evaluation; the point and rectangle keying flows in `tests/e2e/smoke.spec.ts` cover the editor. |
| Export evaluated world-space gameplay metadata per sampled frame | `tests/unit/sampling.test.ts` and `tests/unit/metadata.test.ts` cover deterministic frame sampling and companion metadata. |

## History and persistence

| Requirement | Evidence |
| --- | --- |
| Undo/redo all project mutations and group continuous gestures | `tests/unit/history.test.ts`, `tests/unit/setup-history.test.ts`, and `tests/unit/animation-history.test.ts` cover bounded history and grouping; shortcut and multi-key undo flows are in `tests/e2e/smoke.spec.ts`. |
| Autosave committed changes to IndexedDB | `tests/unit/autosave.test.ts`, `tests/unit/ux-p1-autosave.test.ts`, and `tests/unit/repository.test.ts` cover debouncing, typed scheduled/saving/saved/error callbacks, failure recovery, flushing, and stored snapshots; `tests/e2e/p1-autosave.spec.ts` verifies visible status and no history/layout movement. |
| Recover recent projects after reload or interruption | `tests/unit/startup.test.ts` and the reload recovery flow in `tests/e2e/smoke.spec.ts` cover startup selection and browser recovery. |
| Self-contained versioned `.boneanim` archives | `tests/unit/archive.test.ts` covers project JSON, manifest, and image-byte round trips. |
| Validate archives before replacing the open project | `tests/unit/archive.test.ts` rejects malformed, undeclared, tampered, and missing asset data before import succeeds. |

## Sprite-sheet export

| Requirement | Evidence |
| --- | --- |
| Select clips separately or combine them | `tests/unit/export-selection.test.ts` covers both selection modes; the export controls flow in `tests/e2e/smoke.spec.ts` covers the UI. |
| Render sampled frames to a fixed transparent logical canvas | `tests/unit/sampling.test.ts`, `tests/unit/pose-images.test.ts`, and `tests/unit/grid.test.ts` cover sampling, render instances, and RGBA composition; the fixed-canvas browser flow is in `tests/e2e/smoke.spec.ts`. |
| Uniform grid sheets with full-size cells | `tests/unit/grid.test.ts` and `tests/unit/grid-output.test.ts` cover layout, PNG composition, and standard Pixi frame data. |
| Packed, trimmed atlas regions with Pixi source and trim metadata | `tests/unit/trim.test.ts`, `tests/unit/packed-atlas.test.ts`, and `tests/unit/packed-output.test.ts` cover trimming, composition, and metadata. |
| Multipage output at texture-size limits | `tests/unit/multipage.test.ts` and `tests/unit/export-integration.test.ts` cover deterministic page partitioning and multipage packed output. |
| PixiJS-compatible frames, animations, and atlas metadata | `tests/unit/grid-output.test.ts`, `tests/unit/packed-output.test.ts`, and `tests/e2e/atlas.spec.ts` cover generation and reload through real PixiJS. |
| Companion metadata for events and gameplay geometry | `tests/unit/metadata.test.ts` and the combined grid integration flow in `tests/unit/export-integration.test.ts` cover frame-indexed companion output. |

The audit found no first-release requirement without executable evidence. The
clean-checkout result is recorded in [`release-regression-v1.md`](release-regression-v1.md).
