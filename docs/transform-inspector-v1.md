# Transform inspector v1

Bones and attachments expose numeric setup fields for translation, rotation,
nonuniform scale, and shear. The UI edits angles in degrees and converts them
to the domain's radian representation at the command boundary.

Image attachments additionally expose opacity and normalized pivot coordinates.
Rectangle attachments expose positive width and height. Submitting a form
creates one grouped history entry containing all fields for the selected
entity; domain operations reject non-finite, out-of-range, or non-positive
values without changing the project.

Move, Rotate, Scale, and Shear are selected from the persistent toolbar beside
the canvas. This keeps tool access independent of inspector scroll position and
selection type while preserving the existing pressed state and pointer gesture
transactions. Inspector fields remain the place to edit numeric values
directly; the toolbar does not add shortcuts or history entries.
