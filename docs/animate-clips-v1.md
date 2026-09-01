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

Numeric key interpolation is stored on the key as the outgoing mode for the
segment leading to the next key. The selected-key editor can choose Stepped,
Linear, or Cubic Bezier interpolation; selecting Bezier creates normalized
default control points that the graph editor can refine later.

Bezier keys expose a graph with draggable control points and P1/P2 coordinate
inputs. X coordinates are constrained to the normalized segment range, while
Y coordinates can represent overshoot. Curve edits are drafted locally and
committed as a single key update when the drag or Apply curve action ends.

Slot attachment tracks use discrete keys that can select None or any image
owned by the tracked slot. The selected-key editor updates that value without
changing the key time or identity, so attachment swaps remain independent of
setup attachment assignment.

Draw-order tracks use a complete slot-order key at each keyed frame. The
selected-key editor lists the keyed slots and moves a slot earlier or later by
one position, preserving the key identity and validating that every project
slot remains present exactly once.

Animation actions that update several keys, such as multi-key deletion, reduce
through one history transaction. Undo therefore restores the complete prior
selection in one step, while single-key edits and atomic retiming commands keep
their own entries.

Auto Key is enabled by default for the editor session. Editing a changed bone
or attachment transform in Animate mode updates setup data and creates or
upserts the corresponding numeric key at the current frame in the same
history transaction. Opacity and rectangle-size changes use the same path.

With Auto Key disabled, changed numeric properties are retained as pending
edited-but-unkeyed state. The Animate panel exposes an explicit Key edited
properties action that commits all pending values at the current frame in one
transaction; the pending state is cleared only after a successful commit.

Inspector property labels expose the state at the active frame: Unkeyed when no
track or key exists, Pending for an edited-but-unkeyed property, and Keyed when
a track contains a key at that frame. The same state is computed from the
active clip and pending edit set so it stays aligned with the timeline.

Browser coverage exercises clip lifecycle, playback, timeline navigation,
typed-key editing, interpolation and Bezier controls, multi-key retiming and
deletion, Auto Key, pending edits, slot attachment swaps, and keyed draw order.
