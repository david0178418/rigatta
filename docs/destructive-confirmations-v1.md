# Destructive confirmations v1

Deleting an animation clip, bone, slot, or attachment requires an explicit
browser confirmation. These operations remove authored project data and are
only recoverable through the current bounded undo history; a reload or later
history eviction may make that recovery unavailable.

Cancelling the confirmation leaves the project, selection, and autosave state
unchanged. Timeline key, event, and track deletion remains a small reversible
edit handled by the existing undo history.
