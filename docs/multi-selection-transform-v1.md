# Multi-selection transforms v1

When multiple bones or attachments are selected, a Setup transform gesture
updates every transformable member in one history transaction. Assets and slots
can remain selected for context but are ignored by the transform reducer.

The Properties inspector applies compatible common numeric edits to every
selected bone or attachment in one immutable history transaction. A mixed
property is marked `Mixed`; entering one value commits it to all supported
members. Properties that would only apply to one attachment kind are hidden or
disabled with an explanation instead of partially changing the selection.

Translation, scale, and shear use each member's parent-local pointer delta;
rotation uses the shared group-center pointer angle. The group handle center is
the average of the selected entity origins. A cancelled pointer gesture leaves
all members unchanged, and one undo removes the entire multi-target edit.

Holding `Shift` constrains the shared gesture: translation and shear use the
dominant local axis, scale uses one factor for both axes, and rotation snaps to
15-degree increments. Rectangle aspect locking applies only to its
rectangle-specific scale handle.

Unit coverage verifies command generation for multiple image/gameplay
attachments. The existing Setup browser coverage continues to verify the
pointer transaction path against the rendered canvas.
