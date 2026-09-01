# Transform inspector v1

Bones and attachments expose numeric setup fields for translation, rotation,
nonuniform scale, and shear. The UI edits angles in degrees and converts them
to the domain's radian representation at the command boundary.

Image attachments additionally expose opacity and normalized pivot coordinates.
Rectangle attachments expose positive width and height. Submitting a form
creates one grouped history entry containing all fields for the selected
entity; domain operations reject non-finite, out-of-range, or non-positive
values without changing the project.
