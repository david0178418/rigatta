# Slot attachment assignment v1

Selecting a slot exposes its `Setup image` selector. The selector contains
`None` and every image attachment owned by that slot; changing it dispatches a
typed `assign-slot-attachment` command and replaces the setup pose immediately.

An image can also be dragged from the library onto a slot row. This creates a
new image attachment, copies the slot's current setup transform, opacity, and
pivot when one exists, and assigns the new attachment as the setup image in
one history transaction. Existing attachments remain available for later
swapping.

The domain validates that assigned attachments are images belonging to the
target slot. Browser coverage imports two images, creates the first slot
attachment, swaps in the second image through a slot drop, and verifies the
replacement can still be transformed.
