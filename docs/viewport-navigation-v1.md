# Viewport navigation v1

The viewport displays the fixed logical canvas inside a clipped square stage.
Navigation transforms the display host with CSS while leaving the Pixi canvas
pixel dimensions and logical coordinate system unchanged.

- The mouse wheel zooms between 25% and 400%, anchored at the pointer.
- Primary dragging is reserved for the editor: click an entity to select it,
  drag an empty region for a marquee, or drag a selected entity/handle to
  transform it.
- Middle-button dragging and Space+primary dragging pan the canvas in screen
  pixels. Pan takes precedence over selection, marquee, and transform claims.
- Escape cancels the active pan, marquee, or transform gesture before release
  can change selection.
- The `−`, percentage, `+`, and `Center` controls provide keyboard-focusable
  zoom and reset actions. Each compact control exposes its action in a visible
  hover/focus tooltip as well as an accessible name.

The default state is 100% zoom with zero offset. Export and PNG extraction use
the renderer canvas directly, so viewport navigation cannot alter exported
frame dimensions or coordinates.

Move, Rotate, Scale, and Shear are available in a persistent toolbar at the
canvas edge. The toolbar remains available while the hierarchy/inspector dock
scrolls and while no entity is selected; its buttons expose the same `W`, `E`,
`R`, and `T` shortcuts documented in [Keyboard shortcuts](keyboard-shortcuts-v1.md).
Selecting a tool changes the active transform tool but does not add a
project-history entry or change viewport navigation state. The toolbar is a
vertical ARIA toolbar with directional focus movement and visible action/
shortcut tooltips.
