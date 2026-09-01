# Sampled pose rendering v1

The fixed-canvas renderer exposes `renderPose` alongside the Setup renderer.
It accepts a validated project, one evaluated pose, and the persisted asset
blobs. The renderer resolves the pose's active attachment per slot, follows
the evaluated draw order, applies the evaluated world matrix and opacity, and
renders only image sprites.

Sampled output is transparent and uses the project's logical canvas dimensions.
It does not draw the editor grid, bones, gameplay guides, selection guides, or
viewport pan and zoom state. PNG extraction reads the same fixed canvas after
`renderPose` completes.
