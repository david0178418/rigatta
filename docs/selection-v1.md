# Selection v1

Selection is editor session state represented by typed entity IDs. A normal
click replaces the selection; Ctrl-click or Cmd-click toggles one entity.
Asset rows, hierarchy rows, and logical-canvas hits all update the same state.

Shift-dragging the viewport draws a screen-space marquee and converts its
corners through the current pan and zoom back into logical-canvas bounds. The
app selects visible image/gameplay attachments and bone preview segments that
intersect those bounds. Plain left-dragging remains viewport pan.
