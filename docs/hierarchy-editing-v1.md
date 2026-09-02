# Hierarchy editing v1

The setup hierarchy is edited through typed project commands. The Rig dock's
contextual `Add` menu exposes root bone, child bone, slot, image attachment,
point, and rectangle workflows. Selecting any bone, slot, or attachment exposes
a normalized-name editor and a safe delete action. Image attachments assigned
to a slot are unassigned before deletion in one grouped history transaction.

The image attachment menu item opens the Assets tab with the current bone or
slot context intact. The existing asset drag paths then create an attachment on
the selected slot or create a slot and attachment at a canvas drop point. The
menu keeps unavailable actions visible with the selection required to enable
them, while Properties contains no duplicate structure-creation controls.

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

Rig names can be edited in place by double-clicking a row or pressing F2 while
the row is focused. Enter and blur submit the trimmed name through one project
command; the field ignores the blur that follows an Enter submission. Escape
cancels the draft, and a successful submission or cancellation restores focus
to the tree row. Empty names and duplicate names in the same entity collection
are rejected in the field, leaving the draft available for correction. The
inspector reads the same selected entity ID, so its name updates with the tree
rename rather than maintaining a second label.

The Rig search accepts entity names and type labels, including multi-word
queries. Matching rows are shown with their ancestors as explicitly marked
search context; rows outside the match paths are filtered out. Search expands
paths only in the view and labels those virtual expansions, while ordinary
collapsed rows retain their saved disclosure state. Clearing search restores
the exact expansion and focused-row state from before the search began.
