# Prototype conclusions v1

The first-release technical choices are:

- Keep all authoring coordinates in a fixed project-level logical canvas. The
  viewport owns pan and zoom; rendering, hit testing, and export use logical
  coordinates.
- Use immutable version-1 project data with lower-case UUID v4 entity IDs and
  typed commands reduced through bounded history.
- Use PixiJS behind a renderer lifecycle adapter. Editor previews render to a
  fixed-size transparent canvas and can expose PNG extraction without leaking
  Pixi objects into the domain.
- Store project metadata and source image blobs in separate IndexedDB stores,
  and package validated metadata plus bytes in `.rigatta` ZIP archives.
- Import only validated PNG, JPEG, and WebP bytes, preserving normalized safe
  relative paths. Directory picker and recursive drop are both supported.
- For packed Pixi output, trim rendered RGBA frames while retaining the full
  logical `sourceSize` and visible `spriteSourceSize` offset. A browser harness
  reloads the generated metadata through PixiJS `Spritesheet` and verifies the
  packed frame, `orig`, and `trim` rectangles.

Fully transparent frames remain an explicit exporter case requiring a
placeholder policy. Atlas packing, sampled animation export, and gameplay
metadata generation stay in their later task phases; these prototypes fix the
interfaces and invariants those implementations must satisfy.
