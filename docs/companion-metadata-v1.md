# Companion animation metadata v1

`createCompanionMetadata` builds the `boneanim-metadata.json` document from
sampled clip frames. Each frame carries its deterministic index, time, frame
key, atlas page, events, point records, and rectangle records. Point and
rectangle maps use stable attachment IDs; rectangle records retain four
world-space corners, evaluated width, height, rotation in radians, and enabled
state.

An event is assigned to `floor(eventTime * fps)`, clamped to the final sampled
frame. This makes an exact frame boundary belong to the frame beginning at that
time. Events retain stable IDs, normalized names, and validated structured
payloads.

Metadata generation validates the project and all sample/key/page arrays before
creating any clip records. Duplicate clip names, frame keys, stale clip inputs,
and incomplete arrays are rejected.

Point and rectangle setup fields are edited in the Properties inspector. Their
current Animate values are evaluated at the active frame, while keyed enabled
state and rectangle size remain distinct from setup data. Rectangle width and
height are positive pixel units; exported metadata continues to use evaluated
world-space corners rather than editor-local coordinates.
