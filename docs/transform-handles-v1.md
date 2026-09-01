# Setup transform handles v1

Setup mode exposes four transform tools for one selected bone or attachment:

- Move translates the selected local `x` and `y` values.
- Rotate applies the shortest pointer-angle delta around the selected entity's
  local origin.
- Scale applies independent X and Y pointer deltas and clamps each resulting
  scale component to `0.01` or greater.
- Shear applies independent X and Y pointer deltas to the local shear values.

The selected entity can be dragged directly, or the visible tool handle can be
dragged when it lies outside the entity bounds. Pointer coordinates are mapped
through the fixed logical viewport. A completed drag is one history transaction;
pointer cancellation restores the pre-drag state.

Transform guides and handles are editor overlays rendered after the setup pose.
Export callers can omit the selection and tool render options so these overlays
are absent from captured output. Transforming multiple selected entities is
intentionally deferred to P4-11.

The pure gesture adapter is covered by unit tests for translation, rotation,
nonuniform scale, shear, and handle hit regions. Browser coverage verifies that
a selected image can be moved by dragging in the rendered viewport.
