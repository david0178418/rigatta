# Pixi export validation v1

The browser validation harness reloads generated `SpritesheetData` through a
real Pixi `Spritesheet` backed by an RGBA canvas. `reloadPixiAtlasFrames`
validates every requested frame key and reports the reloaded packed frame,
complete source size, and trim offset. The single-frame helper delegates to the
same batch path.

This catches metadata that is structurally valid JSON but interpreted
differently by Pixi, especially packed coordinates and `sourceSize` /
`spriteSourceSize` trim reconstruction.
