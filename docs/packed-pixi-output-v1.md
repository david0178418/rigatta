# Packed Pixi output v1

Packed pages use the visible placement returned by the packer for each Pixi
`frame` rectangle. The adapter copies `rotated: false`, the source frame's
`trimmed` flag, complete `sourceSize`, and original logical-canvas
`spriteSourceSize` offset into the standard Pixi frame entry.

This preserves the logical origin when a consumer reconstructs a trimmed
texture and keeps packed output compatible with the same `animations` mapping
used by grid output.
