# Hierarchy drag and drop v1

Bone rows in the Setup hierarchy are draggable. Dropping on the upper quarter
of a row places the source before that sibling, the lower quarter places it
after that sibling, and the middle half reparents it as the target's child.

Reparent drops use the world-pose-preserving command, then place the source at
the requested sibling index. The two commands run inside one history
transaction, so one undo restores both hierarchy and local-transform state.
The domain rejects self-drops, descendant cycles, invalid roots, and invalid
sibling indices without mutating the project.

The row preview is an editor-only drop indicator. Unit coverage exercises zone
calculation, command construction, successful preserving reparenting, and
self/descendant rejection.
