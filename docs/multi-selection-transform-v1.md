# Multi-selection transforms v1

When multiple bones or attachments are selected, a Setup transform gesture
updates every transformable member in one history transaction. Assets and slots
can remain selected for context but are ignored by the transform reducer.

Translation, scale, and shear use each member's parent-local pointer delta;
rotation uses the shared group-center pointer angle. The group handle center is
the average of the selected entity origins. A cancelled pointer gesture leaves
all members unchanged, and one undo removes the entire multi-target edit.

Unit coverage verifies command generation for multiple image/gameplay
attachments. The existing Setup browser coverage continues to verify the
pointer transaction path against the rendered canvas.
