# Setup grid and snapping v1

Setup mode exposes controls for grid visibility, logical grid spacing, and
Snap to grid. The grid is rendered inside the fixed logical canvas. Spacing is
positive and finite; the default is 32 logical units.

When snapping is enabled, image drops and transform gesture pointer positions
are rounded independently to the nearest grid intersection. Selection, marquee
bounds, and viewport pan remain continuous. These are editor-session settings,
not project entities, and therefore do not create history entries.

`ViewportCanvas` uses the pure `snapPointToGrid` helper for drop and transform
pointer positions. The Setup browser coverage verifies that the controls can
change visibility, spacing, and snapping state; the current unit suite does not
contain a dedicated snap-point assertion.
