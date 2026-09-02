# Setup browser coverage v1

The Chromium smoke suite covers the Setup shell, recovery after reload, fixed
canvas PNG access, viewport zoom and reset, grid controls, image import and
library-to-viewport drops, selection and transform dragging, slot image
swapping, hierarchy reparenting, the dedicated Draw Order panel (including
setup reordering and Animate source/keying states), and inspector editing of
names and numeric properties.

The tests use a valid in-memory PNG and mocked directory handles, so they do
not depend on a local asset directory or persisted browser state.
