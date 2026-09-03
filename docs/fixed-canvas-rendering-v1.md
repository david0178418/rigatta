# Fixed-canvas rendering v1

The rendering boundary now has two adapters. The fixed adapter owns a transparent
renderer canvas whose internal pixel dimensions equal the project's logical
canvas. The editor adapter owns a separate viewport-sized surface and applies
the camera in a Pixi world container. CSS no longer supplies the editor camera,
so the editor and export surfaces do not share viewport dimensions or clipping
behavior.

`createFixedCanvasRenderer(host, size)` is the fixed export/capture adapter. Its
`renderSetup`, `renderPose`, and `capturePng` methods operate on the exact logical
pixel surface. `createEditorViewportRenderer(host, dimensions)` is the editor
adapter; its `resize` method accepts CSS dimensions and device-pixel resolution,
and its `setCamera`/`setWorldTransform` methods position the world-space scene.

Both adapters use the pure scene/resource boundary in `render-scene.ts` and
`image-resources.ts`, but they retain their separate surface and lifecycle
policies. The editor surface is not the export canvas.

Each adapter receives validated domain data and applies the domain affine
matrices through Pixi's matrix boundary. It draws the optional grid, setup
attachments, gameplay guides, and bone guides in separate display layers. Image
attachments use the catalog pivot and a texture created from a decoded local
`ImageBitmap`; no source directory handle is retained.

Rendering is manual (`autoStart: false`) so a pose update is an explicit
render boundary. The editor keeps its viewport renderer alive while Setup and
Animate state changes request new content; render requests are coalesced so an
older asynchronous render cannot replace a newer pose. PNG extraction reads the
fixed renderer canvas after a render, and renderer destruction releases Pixi
resources and decoded bitmaps. Both Pixi adapters set
`preserveDrawingBuffer: true`, keeping explicit browser canvas readbacks valid
for screenshots and PNG assertions after a render.

The current browser harness verifies the viewport-sized editor canvas, its
device-pixel backing dimensions, non-square camera behavior, pose pixel changes,
and a PNG data URL from the mounted editor canvas. The full `bun run test:e2e`
suite passes all 112 tests against a manually held occupied `bun run dev`
server. It does not directly verify the fixed adapter's exact dimensions or
captured clipping, so those claims remain an adapter contract rather than a
checked runtime result in the viewport workspace closeout.

## Loading workflow

The adapters resolve each image attachment's asset ID against the supplied local
blob map, validate the blob signature and catalog dimensions, decode it with
`createImageBitmap`, and create a Pixi texture. A missing blob, failed decode,
invalid project, or destroyed renderer returns a typed failure. The adapters
release prepared textures and bitmaps whenever content is replaced or the
viewport is unmounted, so a stale directory handle is never required for
rendering.
