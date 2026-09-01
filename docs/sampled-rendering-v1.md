# Sampled pose rendering v1

The fixed-canvas renderer exposes `renderPose` alongside the Setup renderer.
It accepts a validated project, one evaluated pose, the persisted asset blobs,
and optional editor render flags. The renderer resolves the pose's active
attachment per slot, follows the evaluated draw order, applies the evaluated
world matrix and opacity, and renders image sprites. Animate-mode preview can
also request the grid, evaluated bones, and evaluated gameplay guides so a
clip's motion is visible even when a keyed bone has no image attachment.

Sampled/export output calls `renderPose` without editor flags, so it remains
transparent and uses the project's logical canvas dimensions without grid,
bone, gameplay, selection, or viewport pan and zoom layers. PNG extraction
reads the same fixed canvas after `renderPose` completes.
