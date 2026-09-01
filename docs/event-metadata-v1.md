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
