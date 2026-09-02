# Built-in example project v1

The `Project` menu's `Load example` action loads a small deterministic cutout rig
named `Cutout Robot Example`. It includes one PNG asset, a two-bone hierarchy,
an image slot, a point, a rectangle, one looping 12 FPS clip, and a structured
event. The project uses a 256 × 256 logical canvas.

Loading the example replaces the current in-memory project and schedules it for
recovery autosave. If the current project has authored content, the action
requires confirmation first. The export fixture uses the same project and
asset bytes, so validation and sampling coverage exercise the built-in sample.
