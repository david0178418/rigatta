# Animate clips v1

Animate mode exposes the version-1 clip lifecycle through the same immutable
command reducer used by Setup mode. A clip can be created, selected, renamed,
duplicated, and deleted. Duplication preserves playback settings, tracks, keys,
and event payloads while allocating fresh IDs for the clip and every nested
track, key, and event.

The clip inspector edits positive duration and FPS values and the loop flag.
These settings are project data, so committed changes participate in bounded
history and autosave. The initial timeline keeps the clip controls visible
while later Animate tasks add playback and typed-track editing.
