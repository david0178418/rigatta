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
