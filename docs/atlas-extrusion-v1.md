# Atlas edge extrusion v1

When enabled for packed output, `extrudeRgbaFrame` expands a visible RGBA
region by the configured padding on every side. Each destination pixel samples
the nearest source pixel, which duplicates edge and corner colors into the
padding. The source buffer is never modified.

Extrusion is applied only to non-empty visible regions. Fully transparent
frames remain a separate placeholder case because they have no border pixel to
duplicate.
