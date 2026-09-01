# Packed atlas placement v1

Packed placement uses MaxRects over a fixed page size. Input rectangles are
sorted lexicographically by frame key before placement, and each rectangle
reserves `padding` pixels on all four sides. The returned coordinates describe
the visible frame rectangle inside that reserved space.

Candidate free rectangles use the short-side fit score, then long-side fit,
then fixed `y`, `x`, width, and height tie-breaks. Free-space splitting and
containment pruning are deterministic. A rectangle that cannot fit returns an
error; multipage partitioning is handled by the following export task.
