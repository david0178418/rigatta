# Validation diagnostics v1

`validateProject(project)` returns an immutable list of diagnostics. Each
diagnostic includes a stable `code`, a JSON-like `path`, and a user-facing
message. Validation is read-only and does not repair or mutate the project.

The hardening diagnostics include:

- `missing-asset`: an image attachment references an asset that is not in the
  project asset catalog. The path points to the attachment's `assetId`.
- `duplicate-name`: two assets, bones, slots, attachments, or clips have the
  same trimmed name within their collection. The path points to the later
  duplicate.
- `invalid-reference`: a parent, slot, setup attachment, gameplay bone, draw
  order entry, or other relationship points to an entity that does not exist.

Other validation codes describe malformed values, hierarchy errors, invalid
track targets, and invalid export-facing data. Diagnostics are emitted before
rendering or export can rely on the affected relationship.
