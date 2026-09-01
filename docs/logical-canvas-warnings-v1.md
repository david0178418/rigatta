# Logical-canvas warnings v1

The logical canvas is fixed-size and top-left-origin. Setup image attachments,
point attachments, and rectangle attachments are projected into world-space
bounds before the editor renders them.

`canvasWarningsForSetup(project)` returns deterministic warnings when an
attachment extends past a canvas edge. `canvas-clipping` means the attachment
still intersects the canvas and will be partially clipped. `canvas-overflow`
means its bounds are fully outside the canvas. Image bounds use the source
asset dimensions and the attachment's fixed pivot; rectangles use all four
transformed corners; points use their world position.

The viewport displays these warnings near the canvas. Fixed-canvas export keeps
the same behavior: pixels outside the logical canvas are clipped rather than
expanding the exported frame.
