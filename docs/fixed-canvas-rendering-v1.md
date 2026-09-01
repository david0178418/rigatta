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
render boundary. PNG extraction reads the fixed renderer canvas after a render,
and renderer destruction releases Pixi resources and decoded bitmaps. The
browser harness verifies the 1024 by 1024 default canvas and its PNG data URL.
