# Hierarchy editing v1

The setup hierarchy is edited through typed project commands. Selecting a bone
exposes creation actions for child bones, slots, points, and rectangles.
Selecting any bone, slot, or attachment exposes a normalized-name editor and a
safe delete action. Image attachments assigned to a slot are unassigned before
deletion in one grouped history transaction.

The tree presents bones followed by their slots and image attachments, plus
point and rectangle gameplay attachments owned by each bone. Failed operations
leave both the project and the current selection unchanged.
