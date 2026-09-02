# Hierarchy editing v1

The setup hierarchy is edited through typed project commands. Selecting a bone
exposes creation actions for child bones, slots, points, and rectangles.
Selecting any bone, slot, or attachment exposes a normalized-name editor and a
safe delete action. Image attachments assigned to a slot are unassigned before
deletion in one grouped history transaction.

The tree presents bones followed by their slots and image attachments, plus
point and rectangle gameplay attachments owned by each bone. Failed operations
leave both the project and the current selection unchanged.

The Rig hierarchy is exposed as a WAI-ARIA multi-select tree. Each tree item
keeps its entity type and parent relationship in accessible description text
and in the row tooltip; malformed parent references are announced as
unavailable rather than treated as a valid relationship. Type marks, expand/
collapse controls, and visibility controls use the same inline SVG icon
language, with no text glyphs required to identify a row.

Selection, multi-selection, active setup attachments, hidden items, and drag
targets have structural row indicators in addition to color. Focus stays on
the tree item while disclosure and drag controls remain available, so keyboard
and assistive-technology users receive the same hierarchy context as pointer
users.
