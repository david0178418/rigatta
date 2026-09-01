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

Point transforms are available as numeric attachment tracks for every local
transform property, and point enabled state is a discrete boolean track. New
keys use the current setup value as their boolean default and participate in
the same immutable clip history as other animation keys.

Rectangle guides show their transformed bounds. With the Scale tool active,
the selected rectangle exposes handles on its local right and bottom edges;
dragging those handles emits an immutable rectangle-size command while keeping
the attachment transform unchanged.
