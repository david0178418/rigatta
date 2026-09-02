# Selection v1

Selection is editor session state represented by typed entity IDs. A normal
click replaces the selection; Ctrl-click or Cmd-click toggles one entity.
Asset rows, hierarchy rows, and logical-canvas hits all update the same state.
The Pixi adapter renders selected image bounds, bone segments, and gameplay
guides in a separate overlay layer.

Rig rows expose the same selection state through `aria-selected` on the
treeitem and `aria-pressed` on the row control. A multi-selection gets a
distinct patterned row treatment, while an active setup attachment has a
structural marker and an accessible description. Hover/focus and hierarchy
drop states use borders, outlines, or placement lines so they remain legible
without relying on color alone. Row tooltips and descriptions identify the
entity type and its parent relationship.

Dragging an empty region with the primary pointer draws a screen-space marquee
and converts its corners through the current pan and zoom back into
logical-canvas bounds. The app selects visible image/gameplay attachments and
bone preview segments that intersect those bounds. A primary click on an
entity selects it; a primary drag on a selected entity or its active handle
starts a transform. Middle-drag and Space+primary-drag are reserved for
viewport pan, so they never change selection.

The Rig tree's search is presentation-only. It matches names and type labels,
shows matching rows with marked ancestor context, and omits unrelated branches
without changing the typed project selection or selection history. Search-only
ancestor expansion is labelled separately from a saved collapsed state and is
not persisted. Clearing the query restores the expansion and focused row that
were active before filtering. Inline rename selects the edited entity through
the same selection path, and committing or cancelling returns focus to that
row so the inspector remains synchronized with the selected ID.
