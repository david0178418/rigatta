# Animate clips v1

Animate mode exposes the version-1 clip lifecycle through the same immutable
command reducer used by Setup mode. A clip can be created, selected, renamed,
duplicated, and deleted. Duplication preserves playback settings, tracks, keys,
and event payloads while allocating fresh IDs for the clip and every nested
track, key, and event.

The clip inspector edits positive duration and FPS values and the loop flag.
These settings are project data, so committed changes participate in bounded
history and autosave. The initial timeline keeps the clip controls visible
while later Animate tasks add typed-track editing.

Playback is represented as an integer frame index with a retained sub-frame
remainder. The controls can play, pause, and step by one frame. Looping wraps
from the final frame to frame zero; non-looping clips stop on their final frame
and can be restarted with Play.

The playhead is a one-based display over a zero-based frame index. Its range
input only accepts integer frame positions, and seeking clears the sub-frame
remainder and pauses playback so the selected frame remains stable.

The timeline navigation keeps a clamped frame window over longer clips. Zoom
uses the active frame as its anchor, pan moves by visible pixel distance, and
the track filter is case-insensitive and matches the typed track label.

Typed tracks are represented as dopesheet rows. Each row includes the target
and property label, the track kind, and key markers snapped to the nearest
integer frame. Markers outside the current navigated frame window are hidden.

Available typed properties can be added as tracks. The selected track accepts
keys at the current playhead frame, and selected key markers can be moved,
copied to another frame, or deleted. Numeric, boolean, slot-attachment, and
draw-order key inputs use the corresponding typed domain command.

Key markers support additive selection with Ctrl or Command. A multi-selection
can be retimed by an integer frame offset in one validated command; collisions,
duplicate target frames, and out-of-range results are rejected atomically.
