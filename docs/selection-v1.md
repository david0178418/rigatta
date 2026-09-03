# Selection v1

Selection is editor session state represented by typed entity IDs. A normal
click replaces the selection; Ctrl-click or Cmd-click toggles one entity.
Asset rows, hierarchy rows, and logical-canvas hits all update the same state.
The Pixi adapter renders selected image bounds, bone segments, and gameplay
guides in a separate overlay layer.

Draw Order rows select their slot through the same typed selection path. Timeline
entity/property rows and keyed markers select their target entity, while
additive timeline selection keeps an already selected entity selected as more
keys are chosen. The selected entity remains reflected in the Rig tree,
inspector, canvas guides, and any visible grouped timeline rows without one
surface echoing its own update back into the others.

Rig rows expose the same selection state through `aria-selected` on the
treeitem and `aria-pressed` on the row control. Disclosure and visibility
controls expose their current `aria-expanded`/`aria-pressed` state and show an
action tooltip on hover or focus. A multi-selection gets a
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

Explicit entity selections are kept in a bounded, immutable session history.
Page Up and Page Down, or the Previous and Next toolbar buttons, move through
that history without creating replay entries. The v2 UI-preference record keeps
each snapshot as typed `{kind, id}` entities, so additive and repeated
selections survive reload without flattening. A replay restores the complete
valid additive selection, expands its Rig ancestors, opens the Rig dock when
needed, clears an incompatible Rig filter, and scrolls the target row into
view. Removed entities are skipped; if only part of a historical selection
still exists, the surviving members are restored. Selection history is
presentation state only and is not included in project archives, animation
exports, or project history.
