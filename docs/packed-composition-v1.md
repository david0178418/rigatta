# Packed atlas composition v1

Packed composition accepts trimmed RGBA frame regions, sends their visible
dimensions through deterministic multipage placement, and creates one
transparent fixed-size RGBA page per packed page. Without extrusion, trimmed
pixels begin at the returned visible placement. With extrusion enabled, the
reserved padding is filled by the nearest edge and corner pixels.

Fully transparent frames are rejected because their zero-size visible region
has no pixels to place; a later exporter policy must provide a placeholder.
