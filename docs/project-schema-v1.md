# Project schema version 1

The saved project is UTF-8 JSON with a top-level `schemaVersion` of `1`.
Arrays preserve authoring order. IDs are references, not array indexes.
Derived child lists and world transforms are deliberately not persisted.

## Stable opaque IDs

Every project entity uses a lower-case RFC 4122 version 4 UUID string:

```text
xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
```

IDs are generated once when an entity is created and remain unchanged through
rename, reorder, reparent, save, import, and export. Names are presentation
labels and must never be used as references. IDs are not reused within a
project, including after deletion. An importer rejects malformed IDs,
duplicate IDs, and references to missing IDs.

The ID is opaque to application code: code may compare it for equality or use
it as a map key, but may not infer entity type or meaning from its characters.

## Top-level shape

The following is the normative structure. The detailed transform and export
field meanings are defined in the other version 1 schema documents.

```ts
type ProjectV1 = {
  schemaVersion: 1;
  id: EntityId;
  name: string;
  logicalCanvas: {
    width: number;
    height: number;
  };
  assets: ImageAsset[];
  bones: Bone[];
  boneOrder: EntityId[];
  slots: Slot[];
  attachments: Attachment[];
  setupDrawOrder: EntityId[];
  clips: Clip[];
  exportSettings: ExportSettings;
};

type EntityId = string;

type ImageAsset = {
  id: EntityId;
  name: string;
  relativePath: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
};

type Bone = {
  id: EntityId;
  name: string;
  parentId: EntityId | null;
  transform: LocalTransform;
};

type Slot = {
  id: EntityId;
  name: string;
  boneId: EntityId;
  setupAttachmentId: EntityId | null;
};

type Attachment =
  | ImageAttachment
  | PointAttachment
  | RectangleAttachment;

type ImageAttachment = {
  id: EntityId;
  kind: 'image';
  name: string;
  slotId: EntityId;
  assetId: EntityId;
  transform: LocalTransform;
  opacity: number;
  pivotX: number;
  pivotY: number;
};

type PointAttachment = {
  id: EntityId;
  kind: 'point';
  name: string;
  boneId: EntityId;
  transform: LocalTransform;
  enabled: boolean;
};

type RectangleAttachment = {
  id: EntityId;
  kind: 'rectangle';
  name: string;
  boneId: EntityId;
  transform: LocalTransform;
  width: number;
  height: number;
  enabled: boolean;
};

type Clip = {
  id: EntityId;
  name: string;
  durationSeconds: number;
  fps: number;
  loop: boolean;
  tracks: Track[];
  events: EventKey[];
};

type ExportSettings = {
  mode: 'grid' | 'packed';
  maxTextureSize: number;
  padding: number;
  extrudeEdges: boolean;
};
```

The `Track`, `EventKey`, and sampled gameplay metadata shapes are summarized in
[`schema-reference-v1.md`](schema-reference-v1.md) and retain the same ID and
immutability rules.

## Validation invariants

Runtime validation must reject a project when any of these are false:

- `schemaVersion` is exactly `1`.
- Canvas dimensions, image dimensions, durations, FPS, and export dimensions
  are finite positive values within their documented limits.
- Names are non-empty strings after trimming.
- Every ID is valid and unique.
- Every parent, bone, slot, asset, attachment, and track reference resolves.
- The bone parent graph has exactly one root and contains no cycles once bones
  exist. An empty project may have no bones yet.
- A slot references a bone and its setup attachment is either null or an image
  attachment belonging to that slot.
- Image opacity and normalized pivots are in `[0, 1]`.
- Rectangles have positive dimensions.
- Transforms contain only finite values and use nonzero scale components when
  an inverse operation is required.
