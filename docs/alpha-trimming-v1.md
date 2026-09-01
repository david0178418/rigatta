# Alpha trimming v1

Packed export starts with RGBA pixels rendered at the complete logical canvas
size. The trim step scans alpha values above the configured threshold and
copies the smallest visible rectangle into a new buffer.

The result retains:

- `sourceSize`: the complete logical frame size;
- `spriteSourceSize`: the visible rectangle's logical-canvas `x`, `y`, `w`, and
  `h` offset;
- `pixels`: the cropped RGBA buffer; and
- `trimmed`: whether the visible rectangle differs from the source canvas.

Restoring a trimmed buffer places it back at `spriteSourceSize.x/y` in a
transparent `sourceSize` buffer. This round-trip is the invariant used by the
Pixi atlas metadata generator. Fully transparent frames use zero-size visible
metadata and remain a separate export case for the atlas packer.
