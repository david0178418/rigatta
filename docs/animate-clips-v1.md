# Animate clips v1

Animate mode exposes the version-1 clip lifecycle through the same immutable
command reducer used by Setup mode. A clip can be created, selected, renamed,
duplicated, and deleted. Duplication preserves playback settings, tracks, keys,
and event payloads while allocating fresh IDs for the clip and every nested
track, key, and event.

The timeline keeps clip selection, creation, transport, frame/time readout,
Auto Key, and navigation controls in its sticky toolbar. Selecting Clip
settings routes the clip context to the right-dock Properties inspector, where
rename, duration, FPS, and loop editing are available. These settings are
project data, so committed changes participate in bounded history and autosave.

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
and empty property lanes seek directly to the clicked frame. Every timeline
lane has a keyboard-accessible group equivalent with Arrow/Home/End and
Enter/Space seeking; property labels are keyboard-selectable buttons with the
same selection behavior as a pointer click.

Typed tracks are represented in a grouped dopesheet with an overview row,
collapsible entity rows, and property rows. Each row includes the target and
property label, the track kind, and key markers snapped to the nearest integer
frame. Aggregate keys appear in overview and entity rows. Marker shapes and
line styles distinguish continuous linear, stepped, Bezier, attachment,
draw-order, enabled, and event data. Markers outside the current navigated
frame window are hidden.

Selection mode also supports individually pinned entity groups. Use the pin control on
an entity row to keep that group and its properties visible while project selection
changes; clicking the row still selects the related bone, slot, or attachment and keeps
the tree/canvas selection synchronized. `Clear pins` removes every pin. Pin state is a
project-scoped UI preference, so it survives reloads and does not enter project history,
`.boneanim` archives, sprite-sheet exports, or pose evaluation. Stale entity IDs are
discarded when preferences are applied, and pin controls are available only in Selection
mode; All keyed mode shows every keyed track independently.

Available typed properties can be added from the small Track creation menu in
the timeline. The selected track accepts keys at the current playhead frame.
Numeric, boolean, slot-attachment, and draw-order key inputs use the
corresponding typed domain command. Track, key, event, draw-order, and
attachment-swap details are edited in the right-dock Properties inspector; the
timeline retains only creation controls and timeline selection.
Track details is a labelled dialog surface with automatic focus entry,
`aria-controls`/`aria-expanded` trigger state, Escape dismissal, and focus
return. Icon-only timeline navigation, transport, marker, disclosure, and pin
actions expose visible hover/focus tooltips with contextual accessible names.
The Clip context exposes one Save clip action plus direct Duplicate clip and Delete
clip actions, so rename, playback settings, and lifecycle commands remain reachable
without reopening a timeline dialog.

Clicking a key selects it and seeks to its frame; Ctrl/Cmd-click toggles it.
Selected keys can be dragged by whole frames, selected with a two-dimensional
marquee from any empty right-hand grid lane, copied and pasted at the playhead,
deleted, or nudged one frame with the arrow keys. The marquee selects explicit
numeric, boolean, attachment-swap, and Draw Order keys whose visible rows and
frame range intersect the drag; Event markers remain outside the key clipboard.
A click without movement still seeks, and dragging a key marker still retimes
that key. Every multi-key operation is validated before dispatch and is one
recoverable history transaction; collisions, duplicate target frames, and
out-of-range results are rejected atomically. The Properties inspector shows
exact frame/value/interpolation state. A multi-key selection displays mixed
values explicitly; entering a common value applies it to every compatible
selected key in one history transaction.

## Pose clipboard

The editor provides an application-local **Copy pose** / **Paste pose** workflow
in Animate mode. It remains separate from timeline copy/paste, which copies
selected keys, relative frame offsets, and interpolation metadata.

**Copy pose** is available only when Animate mode has an active clip and an
evaluated pose. It snapshots the evaluated parent-local transforms used by
viewport rendering for every bone and every image, point, and rectangle
attachment in the active rig. The snapshot includes `x`, `y`, `rotation`,
`scaleX`, `scaleY`, `shearX`, and `shearY`; copying an interpolated frame stores
the interpolated values at that playhead rather than setup transforms or only
the values of keys at the playhead. The snapshot is session-only and is not
changed by later project or pose changes. Copying creates no history, autosave,
project, selection, or pending-edit changes.

**Paste pose** is available only in Animate mode with a nonempty pose
clipboard. It writes the snapshot to the active clip at the current playhead
without moving the playhead. A paste into another clip is supported when that
clip belongs to the same project and every copied entity ID and kind remains
compatible. For each copied entity, all seven local transform properties are
keyed so the sampled pose does not depend on neighboring keys. Missing tracks
and destination keys are created as needed; a new key uses `linear`
interpolation and `curve: null`.

When a destination transform key already exists, pose paste replaces only its
numeric value. The existing key keeps its ID, time, outgoing interpolation, and
Bezier curve, so paste does not overwrite destination timing or interpolation
metadata. A value-identical key produces no command; an entirely identical
paste produces no history entry.

Interpolation curves are not copied as pose data; the curve-preservation rule
above applies to the existing curve on a destination key.

Validation and ID planning finish before any command is dispatched. A
successful paste is one atomic, recoverable history transaction, so one Undo
restores the complete prior pose-key state, including tracks created only by
the paste. An invalid or incompatible paste leaves the project unchanged.
Pose paste is explicit and independent of Auto Key: it does not change the
Auto Key setting or consume unrelated pending edits.

The Animate timeline provides **Copy pose** and **Paste pose** toolbar actions
near Auto Key and `Key edited properties`. Their exact shortcuts are
`Ctrl/Cmd + Shift + C` and `Ctrl/Cmd + Shift + V`; only those Shift-modified
bindings invoke pose actions. Unshifted `Ctrl/Cmd + C` and `Ctrl/Cmd + V`
remain the timeline's selected-key clipboard actions, and Alt-modified
variants do not invoke pose actions. The buttons expose stable accessible
names and shortcut hints, while a polite status region announces copy/paste
success, validation failures, and no-op results.

Pose shortcuts do not move the playhead, change Auto Key, or consume unrelated
pending edits. They are ignored in Setup mode and while focus is in an
`input`, `textarea`, `select`, or contenteditable element. The clipboard is
session-only UI state: it does not enter project data, history, autosave,
archives, exports, or UI preferences.

The pose clipboard plan explicitly excludes Setup mode; cross-project paste and
operating-system clipboard serialization; selected-entities-only pose copy;
slot attachment selection, draw order, image opacity, point/rectangle enabled
state, rectangle width/height, events, and interpolation curves; setup
transforms or other setup data; UI-only state such as selection, hidden
entities, collapsed rows, pins, playhead position, or dock layout; and project
schema, archive, autosave, export, and UI-preference changes. The user-facing
name remains **pose**, not **frame**, until every keyable part of frame state is
intentionally covered.

Numeric key interpolation is stored on the key as the outgoing mode for the
segment leading to the next key. Properties can choose Stepped, Linear, or
Cubic Bezier interpolation; selecting Bezier creates normalized default control
points that the graph editor can refine later. A mixed selection keeps its
mixed frame/value/interpolation state visible; when selected Bezier curves
differ, the editor labels the mixed curve and applying one curve synchronizes
all selected keys atomically.

Bezier keys expose a graph with draggable control points and P1/P2 coordinate
inputs in Properties. X coordinates are constrained to the normalized segment
range, while Y coordinates can represent overshoot. Curve edits are drafted
locally and committed as a single key update when the drag or Apply curve action
ends.

Slot attachment tracks use discrete keys that can select None or any image
owned by the tracked slot. The attachment-swap context in Properties shows
setup, current evaluated, and keyed values independently. It can key the
current value at the active frame or update the selected key without changing
its identity, so attachment swaps remain independent of setup attachment
assignment. Related slot and attachment links navigate the rig without
changing the active clip or timeline context.

Draw-order tracks use a complete slot-order key at each keyed frame. The
draw-order context in Properties lists the current evaluated order and keyed
override separately, and moves a slot earlier or later by one position while
preserving key identity and validating that every project slot remains present
exactly once. Slot links navigate to the related rig item without losing the
timeline context.

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
keyboard-operable button. In a compatible multi-selection, a common key state
toggles every selected entity in one transaction; mixed key states hide the
diamond and identify the mixed state instead of silently changing only the
last-selected entity. Keying and removing use one recoverable history
transaction, and a polite inspector announcement reports pending and keyed
state changes without moving focus.

Event creation remains available from the Events row. Selecting an event opens
the Event context in Properties for name, frame, validated inline JSON payload,
and deletion. Invalid payload text stays in the editor with an error and does
not replace the last valid project payload; add, move, and delete each remain a
single typed command.

The Animate timeline height starts at 260 px and can be resized with its
accessible horizontal separator between 190 px and 55% of the viewport height.
The height is a project-scoped UI preference keyed by `Project.id`, so it is
restored for that project after reload while remaining outside project history,
archives, sprite-sheet exports, and pose evaluation. Browser coverage exercises
clip lifecycle, playback, timeline navigation, typed-key editing,
interpolation and Bezier controls, multi-key retiming and deletion, Auto Key,
pending edits, Properties contexts, slot attachment swaps, keyed draw order,
and gameplay attachment state.
