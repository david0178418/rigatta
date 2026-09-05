# Rigatta product specification

## Product goal

Rigatta is a desktop-oriented web application for authoring rigid cutout animations from separate image parts. It provides a focused subset of Spriter Pro and Spine 2D workflows and exports portable sprite sheets for games, with PixiJS as the current engine target.

The application exports sampled image frames rather than a skeletal-animation runtime.

## Supported environment

- Current desktop Google Chrome.
- Mouse and keyboard input.
- Local, single-user operation with no application server dependency.
- Desktop viewports from 1120 by 720 pixels upward; the automated layout suite also covers 1280 by 800, 1440 by 900, and 1920 by 1080.
- One rig per project and multiple animation clips per rig.

## Current editor workspace

- The header contains project actions, undo and redo, selection history, Setup and Animate modes, keyboard-shortcut help, and sprite-sheet export.
- The resizable left dock contains the searchable rig hierarchy and setup or keyed draw order.
- The center contains the PixiJS canvas viewport, transform toolbar, grid controls, navigation controls, and authoring or preview presentation presets.
- The resizable right dock contains context-sensitive properties and the searchable image library.
- The resizable bottom panel contains clip controls, playback, the dopesheet, track details, event editing, interpolation controls, and pose actions in Animate mode.

The Authoring viewport preset shows rig and editing overlays. Visual Preview hides authoring and gameplay overlays. Gameplay Preview keeps gameplay geometry visible while hiding authoring controls.

## Rig and asset model

The rig separates bones, slots, and attachments:

```text
bone hierarchy
└── slot
    └── one active image attachment
```

- A project has at most one root bone and any number of descendant bones.
- Bones have local translation, rotation, nonuniform scale, and shear transforms.
- Slots belong to bones, select an active image attachment, and participate in an independently editable draw order.
- Image attachments belong to slots and have local transforms, opacity, and fixed pivots.
- Named point and rectangle attachments belong directly to bones and represent gameplay locations and regions.
- Rig evaluation uses rigid forward kinematics. Mesh deformation, vertex weighting, inverse kinematics, and other constraints are not supported.

Image assets can be imported as individual external drops, multiple files, or recursively traversed directories. Directory imports preserve relative folders in the asset library. PNG, JPEG, and WebP files are supported. Imported bytes are copied into browser storage and `.rigatta` archives, so continued access to the source files is not required.

## Setup editing

Setup mode supports:

- Creating, renaming, deleting, reparenting, and reordering bones.
- Creating slots and assigning or swapping their image attachments.
- Creating point and rectangle gameplay attachments.
- Selecting one or multiple rig elements from the hierarchy or viewport.
- Translating, rotating, scaling, and shearing with viewport handles or numeric properties.
- Editing image opacity and pivots and rectangle dimensions.
- Reordering the setup draw order independently of the bone hierarchy.
- Showing, spacing, and snapping to the viewport grid.
- Hiding rig elements from the editor presentation without changing exported project data.

Hierarchy and reference validation prevents cycles and dangling references.

## Animation authoring

Animate mode supports multiple named clips with independent duration, FPS, and loop settings. The editor can scrub, step, play, pause, and loop the active clip.

Continuous tracks support stepped, linear, and cubic Bezier interpolation. Discrete attachment, draw-order, enabled-state, and event values are stepped. Current track types cover:

- Bone and attachment transforms.
- Image opacity.
- Active slot attachments.
- Slot draw order.
- Point and rectangle enabled states.
- Rectangle width and height.

The dopesheet supports creating, selecting, copying, pasting, moving, nudging, retiming, and deleting keys. Pose copying and pasting operates at the current frame. Auto Key is enabled by default; when it is disabled, edited values remain pending until explicitly keyed or discarded. The UI distinguishes unkeyed, pending, and keyed properties.

Clips can also contain named events with JSON-compatible structured payloads. Export evaluates events, points, and rectangles into frame-indexed world-space companion metadata.

## History and persistence

Project mutations participate in bounded undo and redo history. Continuous pointer gestures and grouped multi-value changes commit as single transactions.

Committed projects and image blobs are autosaved to IndexedDB. The Project menu can create a project, load the built-in example, reopen recent local projects, import an archive, or download an editable project archive. UI presentation preferences such as dock layout, visibility, and timeline layout are stored separately in local storage and are not included in project archives.

A `.rigatta` file is a ZIP archive containing:

```text
manifest.json
project.json
assets/<asset-id>.<extension>
```

The current archive and project schema versions are both version 1. Imports validate the archive manifest, project schema, references, asset declarations, image data, byte counts, and SHA-256 hashes before replacing the open project.

## Sprite-sheet export

The Export dialog selects clips and chooses combined or per-clip output. Export is downloaded as a ZIP and provides progress, cancellation, validation diagnostics, and retry behavior.

The export pipeline supports:

- Uniform grid atlases with the full logical canvas retained in every frame cell.
- Packed atlases with transparent pixels trimmed from physical regions while PixiJS `sourceSize` and `spriteSourceSize` retain logical placement.
- Deterministic MaxRects packing with padding and optional edge extrusion.
- Grid and packed output split across pages at the project's maximum texture size.
- Standard PixiJS frame and animation JSON.
- `rigatta-metadata.json` companion data for events, points, hitboxes, and hurtboxes.

Preview and export both use the same renderer-neutral pose evaluator. This keeps sampled transforms, attachments, draw order, and gameplay geometry consistent with the authored animation.

### Current export-settings limitation

Atlas mode, maximum texture size, padding, and edge extrusion exist in the versioned project model and are implemented by the export pipeline. The current editor does not expose controls for changing those settings. New projects default to grid mode with a 4096-pixel maximum texture size, one pixel of padding, and edge extrusion disabled. Imported version 1 project data can contain other valid settings, including packed output.

## Current limitations and non-goals

- The logical canvas is fixed through the current editor UI. New projects use a 1024 by 1024 pixel canvas.
- Mesh deformation, vertex weights, and multi-bone image binding.
- Inverse kinematics and other constraints.
- Multiple rigs in one project.
- Skins, character maps, and batch variant export.
- Onion skinning.
- Audio import and synchronized playback.
- Automatically sized logical frame bounds.
- Skeletal runtime exports and runtime libraries.
- Engine-specific exporters other than PixiJS.
- Firefox, Safari, touch, and mobile support.
