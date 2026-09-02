# Animate clips v1

Animate mode exposes the version-1 clip lifecycle through the same immutable
command reducer used by Setup mode. A clip can be created, selected, renamed,
duplicated, and deleted. Duplication preserves playback settings, tracks, keys,
and event payloads while allocating fresh IDs for the clip and every nested
track, key, and event.

The timeline keeps clip selection, creation, transport, frame/time readout,
Auto Key, and navigation controls in its sticky toolbar. Clip rename,
duplicate, delete, duration, FPS, and loop editing are available from the
contextual Clip settings surface. These settings are project data, so committed
changes participate in bounded history and autosave.

Playback is represented as an integer frame index with a retained sub-frame
remainder. The controls can play, pause, and step by one frame. Looping wraps
from the final frame to frame zero; non-looping clips stop on their final frame
and can be restarted with Play.

The playhead is a one-based display over a zero-based frame index. Its range
input only accepts integer frame positions, and seeking clears the sub-frame
remainder and pauses playback so the selected frame remains stable.

The timeline navigation keeps a clamped frame window over longer clips. Zoom
uses the active frame as its anchor, pan moves by visible pixel distance, and
the track filter is case-insensitive and matches the typed track label. The
ruler and dopesheet live in an independently scrollable timeline pane, while
the event row and playhead remain in that pane below the track rows. The ruler
and empty property lanes seek directly to the clicked frame.

Typed tracks are represented in a grouped dopesheet with an overview row,
collapsible entity rows, and property rows. Each row includes the target and
property label, the track kind, and key markers snapped to the nearest integer
frame. Aggregate keys appear in overview and entity rows. Marker shapes and
line styles distinguish continuous linear, stepped, Bezier, attachment,
draw-order, enabled, and event data. Markers outside the current navigated
frame window are hidden.

Available typed properties can be added from the contextual Track details
surface. The selected track accepts keys at the current playhead frame. Numeric,
boolean, slot-attachment, and draw-order key inputs use the corresponding typed
domain command.

Clicking a key selects it and seeks to its frame; Ctrl/Cmd-click toggles it.
Selected keys can be dragged by whole frames, selected with a two-dimensional
marquee, copied and pasted at the playhead, deleted, or nudged one frame with
the arrow keys. Every multi-key operation is validated before dispatch and is
one recoverable history transaction; collisions, duplicate target frames, and
out-of-range results are rejected atomically. The timeline handles these
operations directly, so Key details is reserved for the exact frame,
interpolation, Bezier, attachment, draw-order, enabled, and event editors.

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
edited-but-unkeyed state. The Animate panel keeps the compact Key edited
properties action beside Auto Key; it commits all pending values at the current
frame in one transaction, and the pending state is cleared only after a
successful commit.

Each animatable inspector property exposes one current-frame key diamond. A
hollow diamond adds a key, a filled diamond removes the key at that frame, and
an amber patterned diamond identifies a pending edit while Auto Key is off.
Every diamond has an accessible property/frame/action label and remains a
keyboard-operable button. Keying and removing use one recoverable history
transaction, and a polite inspector announcement reports pending and keyed
state changes without moving focus.

Event creation remains available from the Events row. Selecting an event opens
Event details for name, validated JSON payload, frame, and delete operations.

The Animate timeline height starts at 260 px and can be resized with its
accessible horizontal separator between 190 px and 55% of the viewport height.
The height is local UI state and is not persisted. Browser coverage exercises
clip lifecycle, playback, timeline navigation, typed-key editing,
interpolation and Bezier controls, multi-key retiming and deletion, Auto Key,
pending edits, slot attachment swaps, keyed draw order, and the contextual
detail surfaces.
