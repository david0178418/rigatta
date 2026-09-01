# Grid export v1

Grid output keeps every sampled frame as a complete logical-canvas cell. The
layout fills rows left to right using as many columns as fit within the
configured maximum texture size, then places remaining frames on later rows.
Frame indexes, placements, and dimensions are deterministic. A layout that
would exceed the configured texture height is rejected until the later
multipage export step handles the split.

RGBA cells are composed into a transparent sheet without changing the source
frames. The PNG encoder writes color type 6 RGBA data with one unfiltered scan
line per row and deterministic zlib/chunk output.
