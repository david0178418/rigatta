# Export frame sampling v1

`sampleClipFrames` is the deterministic boundary between animation evaluation
and export rendering. It validates the project and clip before sampling, then
evaluates integer frame indexes from zero through `ceil(durationSeconds * fps) -
1`. Each sample uses `timeSeconds = index / fps`; it never depends on wall-clock
time or an accumulated remainder.

Every successful sample carries the evaluated pose and the corresponding
world-space gameplay frame. The two values come from the same pose evaluation,
so rendered image parts and exported gameplay metadata cannot drift to
different animation times. Invalid projects and missing clips return
diagnostics with no partial frame list.
