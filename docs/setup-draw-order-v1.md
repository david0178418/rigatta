# Setup draw order v1

Slot rows are draggable in Setup mode. Dropping in the upper half of another
slot places the source before that slot; dropping in the lower half places it
after. The row's `#` indicator shows its current setup draw-order index.

The gesture dispatches one validated `reorder-slot` command. Invalid or
self-drops do not mutate the project, and the reorder is undoable through the
normal history stack. Draw order remains separate from bone hierarchy order.

Unit coverage exercises before/after index calculation and reducer integration;
browser coverage drags two slots and verifies their resulting order indices.
