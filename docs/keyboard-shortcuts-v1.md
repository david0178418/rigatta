# Keyboard shortcuts v1

The editor uses one transform-tool mapping: `W` selects Move/Translate, `E`
selects Rotate, `R` selects Scale, and `T` selects Shear. The older `V`, `C`,
`X`, and unmodified `Z` keys are not transform shortcuts.

## Global shortcuts

| Keys | Action | Semantics |
| --- | --- | --- |
| `Ctrl/Cmd + Z` | Undo | Undo the most recent project change. |
| `Ctrl/Cmd + Shift + Z` or `Ctrl/Cmd + Y` | Redo | Redo the most recently undone project change. |
| `Space` | Play / pause | Play or pause the active clip in Animate mode. |
| `Left Arrow` / `Right Arrow` | Step frame | Move the active clip one frame backward or forward. |
| `?` | Open shortcut reference | Open the in-app keyboard shortcut reference. |
| `W` | Move / Translate | Select the canvas Move tool. |
| `E` | Rotate | Select the canvas Rotate tool. |
| `R` | Scale | Select the canvas Scale tool. |
| `T` | Shear | Select the canvas Shear tool. |
| `F2` | Rename | Start inline rename for the selected bone, slot, or attachment. Commit with Enter or blur; Escape cancels. |
| `Delete` or `Backspace` | Delete | Delete the selected rig item. With timeline keys selected, delete those keys instead. |
| `K` | Key edited properties | In Animate mode, commit pending property edits at the current frame. This is the keyboard equivalent of `Key edited properties`; it does not toggle existing keys off. |
| `Escape` | Cancel / clear | Cancel the active canvas gesture first. Otherwise close an open contextual surface. If nothing is active, clear the project selection. |
| `Page Up` | Previous selection | Restore the previous valid project selection from selection history. |
| `Page Down` | Next selection | Restore the next valid project selection from selection history. |

Canvas navigation also supports `Space` + primary drag or middle-button drag
for pan. Wheel zoom remains pointer-anchored. The Move, Rotate, Scale, and Shear
buttons beside the canvas are the mouse equivalents of `W`, `E`, `R`, and `T`.
The Properties rename, Delete, and key-diamond/`Key edited properties` buttons
provide mouse access to the corresponding editing actions. Playback, frame-step,
and selection-history buttons remain available wherever those actions apply. Click
an empty canvas area to clear selection; contextual surfaces also provide their
own mouse close/cancel controls. Compact icon actions retain an accessible name
outside their tooltip and show a visible hover/focus tooltip; when a shortcut
exists, the same tooltip includes it.

## Pose clipboard shortcuts

These application-local bindings are implemented for Animate mode only. Copy
uses the evaluated local pose at the current playhead, including interpolated
values, for every bone and image, point, and rectangle attachment. It includes
the seven transform properties `x`, `y`, `rotation`, `scaleX`, `scaleY`,
`shearX`, and `shearY`.

| Keys | Action | Semantics |
| --- | --- | --- |
| `Ctrl/Cmd + Shift + C` | Copy pose | In Animate mode, snapshot the evaluated local `x`, `y`, `rotation`, `scaleX`, `scaleY`, `shearX`, and `shearY` transforms for every bone and image, point, and rectangle attachment at the current playhead, including interpolated values. |
| `Ctrl/Cmd + Shift + V` | Paste pose | In Animate mode, paste the snapshot at the current playhead in the active clip, or in another compatible clip in the same project. Replace destination transform values while preserving existing key IDs, times, outgoing interpolation, and Bezier curves; one successful paste is one undoable transaction. |

The pose clipboard is separate from the timeline key clipboard. Only the exact
Shift-modified bindings above invoke pose actions: unshifted `Ctrl/Cmd + C` and
`Ctrl/Cmd + V` remain timeline-local selected-key copy/paste, and Alt-modified
variants do not invoke pose actions. The pose actions do not move the playhead,
change Auto Key, or consume pending edits. They are ignored in Setup mode and
while focus is in an `input`, `textarea`, `select`, or contenteditable element.
The pose snapshot is held in session-only state; it is not stored in project
data, history, autosave, archives, exports, or UI preferences. The Animate
toolbar buttons expose stable accessible names and shortcut hints, and
copy/paste results, validation failures, and no-op results are announced
through a polite status region.

The plan excludes cross-project paste and operating-system clipboard
serialization; selected-entities-only copying; slot attachment selection, draw
order, image opacity, point/rectangle enabled state, rectangle width/height,
events, and interpolation curves; setup transforms or other setup data; UI-only
state such as selection, hidden entities, collapsed rows, pins, playhead
position, or dock layout; and project schema, archive, autosave, export, or
UI-preference changes.

## Timeline-local shortcuts

These bindings apply only while the Animate timeline has focus, so they do not
compete with unrelated editor controls:

- `Ctrl/Cmd + C`: copy selected timeline keys.
- `Ctrl/Cmd + V`: paste copied timeline keys at the current playhead.
- `Left Arrow` / `Right Arrow`: nudge selected timeline keys one frame. This
  takes precedence over global frame stepping when keys are selected.
- `Delete` or `Backspace`: delete selected timeline keys.
- `Escape`: cancel a key drag or marquee selection.

The focused timeline splitter also accepts `Arrow Up` / `Arrow Down` for one-step
resizing, `Home` for its minimum height, and `End` for its maximum height. These
are layout controls and do not create project-history entries.

Shortcuts are ignored while focus is in an `input`, `textarea`, `select`, or
contenteditable element. The `?` toolbar button opens the same reference without
a keyboard.

## Viewport presentation control

The viewport toolbar contains a compact, labelled `Presentation` group with
`Authoring`, `Visual preview`, and `Gameplay preview` buttons. Each button is
keyboard-focusable, exposes its accessible label and `aria-pressed` state, and
shows a matching tooltip. There is no competing global shortcut: focus the
group and activate the desired preset with Enter or Space.

`Escape` keeps its normal priority and cancels an active canvas gesture before
selection changes. Preview presets disable transform starts while retaining
pan, zoom, Fit, Animate playback, frame navigation, scrubbing, tree selection,
and inspector selection. Switching back to Authoring restores guides and
handles without adding a project-history entry.
