# Gameplay attachments v1

Point attachments appear below their owning bones in the hierarchy and render
as a crosshair at their bone-local transform. Rectangle attachments render as
their transformed bounds. Both kinds remain available to Setup selection,
including when their setup `enabled` value is false; disabled guides use a
muted visual treatment so they can still be edited.

Canvas hit testing and marquee selection use the point marker and rectangle
bounds in world space. Image hit testing continues to consider only the
currently assigned setup attachment, while gameplay attachment selection is
independent of runtime enabled state.
