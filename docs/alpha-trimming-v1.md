# Alpha trimming v1

Packed export starts with RGBA pixels rendered at the complete logical canvas
size. `scanAlphaBounds` scans alpha values above the configured threshold and
returns the smallest visible rectangle without copying pixels. `trimRgbaFrame`
uses that same validated scan before copying the visible pixels into a new
buffer.

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

The atlas metadata adapter writes the trimmed pixel rectangle to `frame`,
retains the complete logical dimensions in `sourceSize`, and retains the
original visible offset in `spriteSourceSize`. A Chromium validation fixture
reloads this metadata through PixiJS `Spritesheet` and verifies that Pixi's
`orig`, `trim`, and packed `frame` rectangles retain those values. Fully
transparent frames are rejected by this adapter until the exporter supplies a
dedicated placeholder policy.
