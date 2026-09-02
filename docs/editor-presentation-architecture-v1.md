# Editor presentation architecture v1

The React editor keeps `EditorShell` as the stateful orchestration boundary.
Project mutations, history transactions, autosave scheduling, selection, and
presentation preference updates remain in `src/app/App.tsx`.

The workspace is composed from focused presentation boundaries:

- `src/app/workspace-docks.tsx` owns the fixed left and right dock shells,
  their linked accessible tabs/tabpanels, collapse controls, contextual Add
  workflow, and typed child component value objects.
- `src/app/properties-inspector.tsx` owns the entity Properties surface and
  delegates shared clip, track, event, and key details to
  `src/app/shared-inspector.tsx`.
- `src/app/canvas-toolbar.tsx` owns transform-tool and grid controls while
  receiving value changes through typed callbacks.
- `src/app/animate-timeline.tsx` owns Animate clip, playback, dopesheet, event,
  and curve presentation; commands are still supplied by `EditorShell`.

`RigTreeView`, `AssetBrowser`, `DrawOrderPanel`, `ViewportCanvas`, and the
timeline splitter remain reusable presentation components. These boundaries
must not import persistence, history reducers, or project-schema changes. UI
preferences and transient view state stay outside the saved project and export
contracts.

The left dock's Rig and Draw Order tabpanels are mutually exclusive while the
right dock's Properties and Assets tabpanels keep their own drag/drop and
scrolling surface. Asset content is mounted only while its tab is active so
switching tabs restores focus to the tab trigger without leaving hidden import
controls in the document's focus order.

The presentation extraction is characterized by
`tests/unit/ux-p1-presentation.test.tsx` and
`tests/e2e/p1-presentation.spec.ts`, in addition to the existing focused
workspace, viewport, inspector, rig, and Animate coverage.
