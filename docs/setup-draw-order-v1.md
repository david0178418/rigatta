# Draw order panel v1

The left dock's Draw Order tab is the dedicated slot-order surface. Rows are
listed from back to front: the first row is farthest back and the last row is
farthest front. The direction is labelled in the panel, and every project slot
is represented once.

Slot rows are draggable in Setup mode. Dropping on another row places the
source at that row's insertion position; the row's `#` indicator shows its
one-based position in the panel and its position in `setupDrawOrder`.

The gesture dispatches one validated `reorder-slot` command. Invalid or
self-drops do not mutate the project, and the reorder is undoable through the
normal history stack. Draw order remains separate from bone hierarchy order.

In Animate mode the panel samples the active draw-order track at the current
frame. Before the first keyed frame it labels the displayed setup order; after
a key it labels the currently evaluated preceding keyed override, including the
frame where that override began. The `Key current order` action records the
displayed order at the current frame through the existing create-track,
add-key, or set-key history commands. Animate rows can also be dragged to edit
the displayed order at the current frame.

Unit coverage exercises setup fallback, preceding-key evaluation, incomplete
order normalization, immutable reordering, and panel source labels. Browser
coverage verifies the dedicated tab, back-to-front slot inventory, setup drag
reordering, Animate source labels, and current-frame keying.
