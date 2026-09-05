# Project and export schema reference v1

This document is the release index for the executable version 1 schemas. The
project schema is persisted in IndexedDB and `project.json` inside a
`.rigatta` archive. Export documents are generated outputs and are never
stored as project state.

## Project document

The top-level project shape is:

```ts
type ProjectV1 = {
  schemaVersion: 1;
  id: EntityId;
  name: string;
  logicalCanvas: { width: number; height: number };
  assets: ImageAsset[];
  bones: Bone[];
  boneOrder: EntityId[];
  slots: Slot[];
  attachments: Attachment[];
  setupDrawOrder: EntityId[];
  clips: Clip[];
  exportSettings: ExportSettings;
};
```

`EntityId` is a lower-case UUID v4 string. IDs are opaque, stable references
and are unique across the entire project, including nested tracks, keys, and
events. Names are trimmed presentation labels and are unique within each
asset, bone, slot, attachment, and clip collection.

`logicalCanvas` is a positive integer fixed frame size with a top-left origin.
All transforms use logical pixels and radians:

```ts
type LocalTransform = {
  x: number; y: number; rotation: number;
  scaleX: number; scaleY: number;
  shearX: number; shearY: number;
};
```

An empty project may have no bones. Once bones exist, there is exactly one root
and every parent resolves. Slots reference bones and optionally one image
attachment. Image attachments reference a slot and asset; point and rectangle
attachments reference bones. Image opacity and pivots are in `[0, 1]`, and
rectangle dimensions are positive.

## Animation document members

Each clip has a positive finite duration and FPS, a loop flag, typed tracks,
and event keys:

```ts
type Clip = {
  id: EntityId;
  name: string;
  durationSeconds: number;
  fps: number;
  loop: boolean;
  tracks: Track[];
  events: EventKey[];
};

type NumberKey = {
  id: EntityId;
  timeSeconds: number;
  value: number;
  interpolation: 'stepped' | 'linear' | 'bezier';
  curve: null | { x1: number; y1: number; x2: number; y2: number };
};

type DiscreteKey<T> = {
  id: EntityId;
  timeSeconds: number;
  value: T;
};
```

Track kinds are `bone-transform`, `attachment-transform`,
`attachment-opacity`, `slot-attachment`, `slot-draw-order`, `point-enabled`,
`rectangle-size`, and `rectangle-enabled`. Numeric tracks use `NumberKey`;
attachment, draw-order, and enabled tracks use typed discrete keys. Keys are
strictly ordered and inside the owning clip duration. Bezier control x values
are in `[0, 1]`; event payloads contain only bounded JSON scalars, arrays, and
objects.

The full field-level project rules are in
[`project-schema-v1.md`](project-schema-v1.md), with event constraints in
[`event-metadata-v1.md`](event-metadata-v1.md).

## Export settings and selection

```ts
type ExportSettings = {
  mode: 'grid' | 'packed';
  maxTextureSize: number;
  padding: number;
  extrudeEdges: boolean;
};

type ExportClipSelection = {
  mode: 'combined' | 'per-clip';
  clipIds: EntityId[];
};
```

Sampling is deterministic: frame `i` uses `timeSeconds = i / fps`, with one
frame for every `ceil(durationSeconds * fps)` frame index. Sampled poses and
gameplay frames are intermediate values, not persisted schema members.

## PixiJS output

Each atlas page is a standard PixiJS spritesheet document:

```ts
type SpritesheetFrame = {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: boolean;
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
};

type Spritesheet = {
  frames: Record<string, SpritesheetFrame>;
  meta: {
    app: 'Rigatta';
    format: 'RGBA8888';
    image: string;
    size: { w: number; h: number };
    scale: '1';
    version: '1';
  };
};
```

Grid frames use the complete logical canvas as their physical cell and are
untrimmed. Packed frames trim transparent pixels, preserve the complete
logical canvas in `sourceSize`, and store the visible logical bounds in
`spriteSourceSize`. Packing never rotates frames. `animations.json` maps each
clip name to its ordered frame-key array:

```json
{ "animations": { "walk": ["walk/frame-0000", "walk/frame-0001"] } }
```

The detailed Pixi frame rules are in [`pixi-export-v1.md`](pixi-export-v1.md),
and grid/packed behavior is covered by
[`grid-output-v1.md`](grid-output-v1.md) and
[`packed-pixi-output-v1.md`](packed-pixi-output-v1.md).

## Companion gameplay metadata

`rigatta-metadata.json` has schema version `1`, the logical canvas, and one
record per sampled frame for each selected clip:

```ts
type CompanionMetadata = {
  schemaVersion: 1;
  logicalCanvas: { width: number; height: number };
  clips: Record<string, {
    fps: number;
    durationSeconds: number;
    loop: boolean;
    frames: Array<{
      index: number;
      timeSeconds: number;
      frameKey: string;
      atlasPage: number;
      events: Array<{ id: EntityId; name: string; payload: JsonObject }>;
      points: Record<EntityId, { x: number; y: number; enabled: boolean }>;
      rectangles: Record<EntityId, {
        corners: [{ x: number; y: number }, { x: number; y: number },
          { x: number; y: number }, { x: number; y: number }];
        width: number;
        height: number;
        rotation: number;
        enabled: boolean;
      }>;
    }>;
  }>;
};
```

Point positions and rectangle corners are world-space logical-canvas values;
rectangle rotation is radians. Event times map to
`floor(eventTimeSeconds * fps)` with final-frame clamping. Stable attachment
IDs, frame indexes, and frame keys let a runtime associate metadata with the
corresponding Pixi frame without using array position as an entity reference.

## Archive and packaging

The self-contained `.rigatta` archive contains `manifest.json`,
`project.json`, and `assets/<asset-id>.<extension>`. Exported sprite output is
packaged separately as atlas PNG/JSON pages, `animations.json`, and
`rigatta-metadata.json`. ZIP paths, JSON, atlas ordering, packing tie-breaks,
and timestamps are deterministic. See
[`rigatta-archive-v1.md`](rigatta-archive-v1.md) and
[`export-zip-v1.md`](export-zip-v1.md) for the file-level contracts.

All project and export inputs are validated before replacement, rendering, or
packaging. Invalid data returns diagnostics or a typed failure and does not
produce partial project state.
