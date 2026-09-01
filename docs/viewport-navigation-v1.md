# Viewport navigation v1

The viewport displays the fixed logical canvas inside a clipped square stage.
Navigation transforms the display host with CSS while leaving the Pixi canvas
pixel dimensions and logical coordinate system unchanged.

- The mouse wheel zooms between 25% and 400%, anchored at the pointer.
- Left-button dragging pans the canvas in screen pixels.
- The `−`, percentage, `+`, and `Center` controls provide keyboard-focusable
  zoom and reset actions.

The default state is 100% zoom with zero offset. Export and PNG extraction use
the renderer canvas directly, so viewport navigation cannot alter exported
frame dimensions or coordinates.
