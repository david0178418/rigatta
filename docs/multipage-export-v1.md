# Multipage packed export v1

Packed output uses deterministic first-fit page partitioning. Frame rectangles
are sorted by key, then each is tested against existing pages in page order by
re-running the deterministic MaxRects packer. An item starts a new page only
when it cannot fit any existing page. Every page uses the configured fixed
texture dimensions and padding.

An item larger than one padded page is rejected with an actionable error rather
than being clipped or silently dropped.
