# Setup history v1

Every Setup project mutation enters through a typed `ProjectCommand` and the
pure reducer. Single-field edits commit directly; multi-step actions such as
library drops, slot image replacement, hierarchy reparenting, and inspector
submits run in one transaction. Continuous transform gestures update a draft,
commit once on pointer release, and cancel back to the original snapshot.

Grid visibility, spacing, and snapping are editor-session preferences rather
than project data, so changing them does not add an undo entry. Project edits
remain autosave triggers only after a transaction is committed.

Unit coverage verifies that multiple setup commands commit as one undo entry.
