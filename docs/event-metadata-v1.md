# Event metadata v1

Clip events are named stepped metadata keys. Event names are trimmed, must be
non-empty, and are limited to 64 characters. Their times must be finite and
inside the owning clip duration.

An event payload is a JSON object containing strings, finite numbers, booleans,
null, arrays, and nested objects. Payload containers hold at most 64 entries,
object keys are non-empty and at most 64 characters, and nesting is limited to
six levels. These limits keep event metadata small and make persisted values
safe to round-trip through JSON.

The project parser applies structural and semantic validation. Invalid event
names, times, non-finite numbers, unsupported values, empty payload keys, and
overly deep or large payload structures are rejected before the project is
accepted.

The Animate timeline exposes events as a dedicated stepped lane. New events
are created at the playhead, then the selected event is edited in the right-dock
Properties inspector. Name and frame fields are inline, and the payload editor
accepts formatted JSON while preserving the last valid project payload whenever
the draft is invalid. Move, update, and delete dispatch one typed command each;
event markers use stable IDs and remain sorted by time after every operation.
