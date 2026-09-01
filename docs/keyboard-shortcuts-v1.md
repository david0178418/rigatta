# Keyboard shortcuts v1

The editor provides these global shortcuts:

- `Ctrl/Cmd + Z`: undo.
- `Ctrl/Cmd + Shift + Z`: redo.
- `Ctrl/Cmd + Y`: redo.
- `Space`: play or pause the active animation clip.
- `Left Arrow` and `Right Arrow`: step the active clip by one frame.
- `?`: open the keyboard shortcut reference.

Shortcuts are ignored while focus is in an input, textarea, select, or editable
element. The `?` button in the top toolbar opens the same reference without a
keyboard.

The reference is available from Setup and Animate mode. Undo and redo operate
on the same bounded history as the toolbar buttons. Playback shortcuts affect
only the active clip; when no clip exists they do nothing.

The Animate timeline splitter also accepts local keyboard controls when it has
focus: Arrow Up/Down resize by one step, Home moves to the minimum height, and
End moves to the maximum height. These controls are component-local layout
actions and do not create project-history entries.
