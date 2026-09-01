# Fixed-canvas rendering v1

The Pixi adapter owns one transparent renderer canvas whose internal pixel
dimensions equal the project's logical canvas. CSS scales that canvas inside
the viewport without changing its coordinate system, so setup and export can
share top-left-origin logical pixels.

The adapter receives validated domain data and applies the domain affine
matrices through Pixi's matrix boundary. It draws the optional grid, setup
attachments, gameplay guides, and bone guides in separate display layers. Image
attachments use the catalog pivot and a texture created from a decoded local
`ImageBitmap`; no source directory handle is retained.

Rendering is manual (`autoStart: false`) so a pose update is an explicit
render boundary. The viewport keeps the renderer alive while Setup and
Animate state changes request new content; animation frame requests are
coalesced so an older asynchronous render cannot replace a newer pose. PNG
extraction reads the fixed renderer canvas after a render, and renderer
destruction releases Pixi resources and decoded bitmaps. The browser harness
verifies the 1024 by 1024 default canvas and its PNG data URL.

## Loading workflow

The adapter resolves each image attachment's asset ID against the supplied
local blob map, validates the blob signature and catalog dimensions, decodes it
with `createImageBitmap`, and creates a Pixi texture. A missing blob, failed
decode, invalid project, or destroyed renderer returns a typed failure. The
adapter releases prepared textures and bitmaps whenever content is replaced or
the viewport is unmounted, so a stale directory handle is never required for
rendering.
