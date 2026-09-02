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
own mouse close/cancel controls.

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
