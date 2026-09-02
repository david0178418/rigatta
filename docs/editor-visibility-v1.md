# Editor-only visibility v1

Rig visibility is a presentation preference, not project data. The preference
adapter stores a validated `hiddenEntityIds` list under the matching
`Project.id`; switching projects filters stale IDs and never carries a hidden
state into another project.

The visibility set has two effects in the authoring editor:

- A hidden bone is not drawn, and its descendants' bones, slots, image
  attachments, and gameplay attachments are not drawn either.
- A hidden bone or attachment is excluded from point and marquee hit testing.

Descendant IDs are not copied into the preference when a parent is hidden. A
descendant can therefore remain selected and can be shown again by revealing
the parent. A directly hidden attachment only affects that attachment; its
owning bone and sibling attachments remain available.

The renderer and hit tester consume this set after pose/setup evaluation. They
do not modify `Project`, history, animation tracks, setup pose values, archive
JSON, or sampled/export frames. Invalid project references remain handled by
the existing validation boundary; visibility resolution itself is cycle-safe
and returns a conservative result without mutating malformed input.

Focused evidence is in `tests/unit/editor-visibility.test.ts`,
`tests/unit/hit-testing.test.ts`, `tests/unit/ui-preferences.test.ts`, and
`tests/e2e/p2-visibility.spec.ts`.
