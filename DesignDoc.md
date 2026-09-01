# Bone Animation Utility

## Product goal

Build a desktop-oriented web application for authoring rigid cutout animations from separate image parts. The editor should provide a focused subset of Spriter Pro and Spine 2D workflows while exporting portable sprite sheets for games. PixiJS is the first engine target.

The first release is an animation-authoring application. It does not include a skeletal-animation runtime for games; animations are sampled into sprite-sheet frames during export.

## Supported environment

- Current desktop Google Chrome.
- Mouse and keyboard input.
- Local, single-user operation with no server dependency.
- One rig per project and multiple animation clips per rig.

## Rig model

The rig uses separate bones, slots, and attachments:

```text
bone hierarchy
└── slot
    └── one active attachment
```

- A rig has one root bone and any number of descendant bones.
- Bones have local translation, rotation, nonuniform scale, and shear transforms.
- Slots are attached to bones and maintain independently keyable draw order.
- A slot may contain multiple image attachments, with no more than one active at a time.
- Image attachments have local transforms, opacity, and a fixed setup pivot.
- Named point and rectangle gameplay attachments are attached to bones.
- Setup and Animate are distinct editor modes.
- Rigid forward-kinematic animation is supported.

## Asset workflow

- Import image directories with a directory picker or directory drag and drop.
- Recursively preserve the imported relative folder structure in the asset library.
- Support PNG, JPEG, and WebP source images in the first release.
- Copy imported assets into local project storage rather than relying on continuing access to the source directory.
- Drag images from the library into the viewport to create image attachments.

## Setup editing

- Create, rename, delete, reparent, and reorder bones.
- Create slots and assign them to bones.
- Add image, point, and rectangle attachments.
- Edit individual or multiple selected image parts.
- Translate, rotate, resize, stretch, shear/skew, and change opacity.
- Configure fixed image pivots.
- Edit the setup draw order independently of the bone hierarchy.
- Configure grid visibility, spacing, and snapping.
- Prevent hierarchy cycles and dangling references.

## Animation authoring

- Create multiple named clips in a project.
- Configure each clip's duration, frame rate, and looping behavior.
- Scrub and play the active clip.
- Create, select, copy, move, and delete keys on a timeline/dopesheet.
- Key bone and image-part transforms and opacity.
- Key the active attachment for image swapping.
- Key slot draw order.
- Use stepped, linear, or editable cubic Bezier interpolation per continuous track segment.
- Treat attachment changes, draw-order changes, enabled states, and events as stepped values.
- Enable Auto Key by default and allow it to be disabled.
- When Auto Key is disabled, provide an explicit action to key edited properties.
- Visually distinguish unkeyed, edited-but-unkeyed, and keyed properties.

## Gameplay metadata

- Place named events at clip times with small structured payloads.
- Create named point attachments for locations such as projectile origins.
- Create named rectangle attachments for hitboxes and hurtboxes.
- Key gameplay attachment transforms and enabled states.
- Key rectangle dimensions and rotation.
- Export evaluated world-space gameplay metadata for each sampled frame.

## History and persistence

- Undo and redo all project mutations, including continuous gestures as single transactions.
- Autosave working projects to IndexedDB after committed changes.
- Recover recent projects after reload or an interrupted session.
- Import and export a self-contained, versioned project archive containing project JSON and all source images.
- Validate imported archives before replacing the open project.

## Sprite-sheet export

- Export selected clips separately or combine them into one output.
- Render frames to a fixed, project-level logical canvas with transparency.
- Support a uniform grid sheet with full-size frame cells.
- Support a packed atlas that trims transparent pixels from physical atlas regions while preserving the fixed logical size and origin in PixiJS `sourceSize` and `spriteSourceSize` data.
- Split packed output across multiple atlas pages when required by the configured maximum texture size.
- Produce PixiJS-compatible frames, animations, and atlas metadata.
- Produce companion animation metadata for events, points, hitboxes, and hurtboxes.

## Deferred features

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

## Technology and coding constraints

- Use Bun for dependency management, development serving, builds, and tests.
- Use strict TypeScript and lean on Bun's built-in HTML and browser bundling features.
- Follow the project conventions demonstrated by the sibling `../math-game` project, whose package name is `math-marsh`.
- Prefer pure functions, immutable state, early returns, shallow control flow, and array methods.
- Do not use `any`, non-null assertions, classes in application code, or type assertions as substitutes for validation.
- Isolate unavoidable class-based third-party APIs, such as PixiJS, behind typed adapters.
- Validate external and persisted data at runtime.
- Provide a `typecheck` script and a comprehensive `check` script.
