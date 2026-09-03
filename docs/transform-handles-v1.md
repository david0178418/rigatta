# Setup transform handles v1

Setup mode exposes four transform tools for one or more selected bones or
attachments:

- Move translates the selected local `x` and `y` values.
- Rotate applies the shortest pointer-angle delta around the selected entity's
  local origin.
- Scale applies independent X and Y pointer deltas and clamps each resulting
  scale component to `0.01` or greater.
- Shear applies independent X and Y pointer deltas to the local shear values.

The selected entity can be dragged directly, or the visible tool handle can be
dragged when it lies outside the entity bounds. Pointer coordinates are mapped
through the fixed logical viewport. Hold `Shift` while starting a transform to
lock Move and Shear to their dominant local axis, snap Rotate to 15-degree
increments, or keep Scale uniform. Shift-resizing a rectangle keeps its
original width-to-height aspect ratio. The viewport toolbar reports
`Shift constraint active` while a constrained transform is updating.

A completed drag is one history transaction; pointer cancellation or `Escape`
restores the pre-drag state. Primary canvas gestures do not pan: use
middle-drag or Space+primary-drag for that navigation gesture.

For a multi-selection, translation, rotation, scale, and shear deltas are
applied to every transformable selection member from the shared gesture
pointer. The handle center is the average of the selected entity origins.
Timeline property-row selection keeps the corresponding entity selected in the
Rig tree and chooses the matching toolbar tool; the resulting pose remains
visible in the Properties inspector without opening a timeline editor.

Transform guides and handles are editor overlays rendered after the setup pose.
Export callers can omit the selection and tool render options so these overlays
are absent from captured output.

The pure gesture adapter is covered by unit tests for gesture precedence,
translation, rotation, constrained axis/angle/uniform-scale values, rectangle
aspect constraints, nonuniform scale, shear, handle hit regions, and
multi-selection command generation. Browser coverage verifies constrained
drag feedback, one-step undo grouping, Escape cancellation, and the rendered
viewport gesture modes.
