# UX P1 and P2 implementation plan v1

## Objective

Implement the remaining work from [UX usability pass v1](./ux-usability-pass-v1.md)
after completion of [UX P0](./ux-p0-tasks-v1.md).

- **P1** makes structure, property keying, and timeline editing direct.
- **P2** improves customization, discoverability, and repeated-work efficiency.

Tasks are ordered by dependency. A task is complete only when implementation,
unit/browser coverage, and affected documentation are updated together.

## Post-P0 baseline

The plan assumes the completed P0 implementation:

- the application is contained within `100dvh`;
- the asset and hierarchy/inspector docks scroll independently;
- Setup uses a compact timeline row;
- Animate uses a resizable, internally scrolling timeline;
- clip, track, key, and event details use contextual surfaces;
- transform tools remain visible beside the canvas;
- layout coverage includes 1120 x 720, 1280 x 800, 1440 x 900, and
  1920 x 1080.

P1 and P2 must preserve those guarantees.

## Implementation checkpoint — 2026-09-02

This document records the 2026-09-02 implementation checkpoint and the
subsequent verified P1/P2 increments. The checkpoint commits are listed below;
the current working tree also contains uncommitted follow-up implementation and
tests. This is not yet a completed P1/P2 release; the task checkboxes below
remain the source of truth for final acceptance.

### Repository state

- Branch: `master`.
- Implementation checkpoint commits through `HEAD` (`33d1435 Extract P1 editor
  presentation boundaries`): `5514d62 Add P1 structure characterization`,
  `8beefbe Complete P1 keying contracts`, `e91c175 Complete P2 layout and
  presentation persistence integration`, `cb5cf67 Complete persistent
  inspector disclosures`, `ed71f08 Complete P1 semantic Rig tree
  interactions`, `49eb197 Implement UX P1-24 autosave lifecycle`, `029a1f1
  Complete UX P1-07 Rig tree visuals`, `5cbea53 Implement UX P2 viewport
  gestures and constraints`, `98a2404 Implement UX P1-14 key diamonds`,
  `3940596 Complete UX P1-04 UI primitives`, `88f34bc Implement UX P2 asset
  density and preview`, `cd4c4df Complete UX P2-09 editor visibility proof`,
  and `33d1435 Extract P1 editor presentation boundaries`.
- Remaining unchecked tasks are still in progress. Preserve unrelated working
  tree changes when resuming; do not reset or discard them.
- Browser checks use `http://localhost:3000/`; reuse an occupied local Bun
  development server when available.

### Implemented or substantially in place

- The fixed workspace has left-side Rig/Draw Order tabs and right-side
  Properties/Assets tabs, with dock splitters, collapse controls, timeline
  resizing, and persisted presentation preferences.
- Rig tree modeling and rendering include ancestry, disclosure, keyboard
  navigation, type labels, filtering, inline rename, visibility, drag/drop, and
  selection-history/reveal behavior.
- The pure timeline model derives stable overview/entity/property, Draw Order,
  and Events rows with Selection/All keyed filtering, expansion, aggregate key
  summaries, target references, and immutable whole-frame key-drag plans.
- The editor shell has the remaining direct timeline interactions wired in
  incrementally; their dependent P1 tasks remain unchecked until their complete
  browser workflows are verified.
- Property draft parsing, direct numeric/name editing, current-frame key
  planning, automatic continuous-track creation, pending Auto Key state, and
  interactive key controls are present. Key diamonds now use distinct hollow,
  amber patterned, and filled states with accessible action labels, live
  pending/keyed announcements, one-transaction add/remove history, and a
  compact pending action beside Auto Key. Entity name and transform editing now
  commit on Enter/blur; the duplicate `Rename` and `Apply values` actions have
  been removed while clip/timeline-specific actions remain.
- Typed autosave lifecycle callbacks report queued, saving, saved, and failed
  writes beside the project name, with page-hide flushing and later-success
  recovery.
- Reusable accessible menu, popover, dialog, toolbar, tooltip, and tab
  primitives cover keyboard focus, dismissal, restoration, and viewport
  containment. Rig rows use durable typed icons and non-color-only state
  annotations.
- Canvas navigation reserves primary drag for selection/transform, supports
  middle-drag and Space+primary-drag panning, retains anchored wheel zoom, and
  reports Shift axis/angle/aspect transform constraints in one gesture history
  transaction.
- Versioned, runtime-validated UI preferences, project-scoped layout state,
  density modes, asset previews/usage metadata, editor-only visibility, canvas
  pan/zoom/selection gestures, transform constraints, and the typed shared
  inspector context have been added.
- The direct property commit path plans one immutable command transaction for
  compatible multi-entity selections, displays mixed values, and rejects
  unsupported properties without mutating the project. Import/drop feedback now
  reports imported, skipped, and conflicting files. Canvas overlays expose
  coordinates, the setup origin, viewport controls, and a labelled grid
  popover.

### Validation already recorded

- `bun test src tests/unit`: 248 tests passed, including semantic Rig-tree,
  contextual workspace Add actions, linked tabpanels, grouped timeline/key-drag,
  preference migration, storage failure, layout matrix, and stale-ID coverage.
- `bun run lint`: passed with three pre-existing missing-return-type warnings in
  `src/app/project-menu.tsx` and `tests/unit/ux-models.test.ts`.
- `bun run typecheck`, `bun run build`, and `git diff --check` pass.
- Focused Chromium workflows cover direct field commits and validation, mixed
  multi-selection display, current-frame key diamonds and undo, import
  conflicts/drop hints, coordinate/origin overlays, grid popover dismissal,
  supported layouts, dock resizing and collapse, linked dock tabpanels,
  contextual Add actions and image-attachment workflow, project-scoped
  presentation restoration, inspector disclosure persistence/isolation, canvas
  gesture precedence, and transform constraints. The workspace/Add-menu suite
  passes all 3 tests, and the affected existing suites pass all 16 tests.
- The latest full `bun run test:e2e` run passes 67 of 72 Chromium tests. Five
  failures remain in the uncommitted sibling Rig-rename/shortcut work and its
  dependent smoke multi-selection workflow; the full P1/P2 gate is therefore
  still open.

### Resume from here

1. The shared inspector styles, mixed-value helpers, direct field wiring, entity
   field cleanup, accessible UI primitives, durable Rig visuals, key diamonds,
   autosave lifecycle, canvas gesture precedence, and transform constraints are
   complete and covered by typecheck/unit/browser validation.
2. P2-07 import/drop outcomes and P2-13 canvas overlays are complete for the
   verified workflows below; their focused coverage is retained in the smoke
   suite.
3. Continue with the remaining unchecked P1/P2 tasks, adding their required
   unit/browser coverage before marking them complete. The full P1/P2 exit
   workflows are not claimed by this checkpoint.
4. Keep `bun run check`, `bun run test:e2e`, and the documentation updates as
   the regression gate for subsequent UX increments.

### Files changed in the current working tree

The main implementation surface is `src/app/App.tsx`,
`src/app/ViewportCanvas.tsx`, `src/app/hit-testing.ts`,
`src/app/inspector-fields.tsx`, `src/app/keying.ts`,
`src/app/property-drafts.ts`, `src/app/rig-tree-view.tsx`,
`src/app/timeline-model.ts`, `src/rendering/fixed-canvas.ts`, and
`src/styles.css`. New supporting modules are
`src/app/editor-visibility.ts`, `src/app/inspector-context.ts`,
`src/app/shared-inspector.tsx`, and the shared UI primitives. Related unit
coverage is in `tests/unit/hit-testing.test.ts`, `tests/unit/import.test.ts`,
and `tests/unit/viewport.test.ts`; browser coverage is in
`tests/e2e/smoke.spec.ts` and `tests/e2e/layout.spec.ts`. Keep
`docs/ux-usability-pass-v1.md` with this task document as the companion
documentation update.

## Scope boundaries

This plan may reorganize application UI state and React components, but it must
not change the project schema or exported animation meaning unless a task
explicitly identifies a required domain command. UI preferences, collapsed
nodes, hidden editor items, dock dimensions, timeline pins, and selection history
must not enter `.boneanim` archives or sprite-sheet exports.

The following remain out of scope: IK, constraints, mesh deformation, weights,
skins/character maps, onion skinning, audio, multiple rigs, automatically sized
logical bounds, skeletal runtime export, and non-Chrome/mobile support.

Implementation must continue to use strict TypeScript, immutable state, pure
helpers, shallow control flow, function components, and runtime validation for
persisted/external values. Do not use `any`, non-null assertions, classes, or
type assertions to bypass validation.

## Resolved interaction decisions

### Workspace

- The left dock contains **Rig** and **Draw Order** tabs.
- The right dock contains **Properties** and **Assets** tabs.
- P1 introduces those fixed placements. P2 adds dock resizing, persistence, and
  remembered active tabs.
- Asset drag-to-canvas and drag-to-slot behavior must work from the right dock.

### Rig tree

- The Rig tab is a semantic multi-select tree following the
  [WAI-ARIA tree view pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/).
- Arrow keys move focus and expand/collapse nodes without changing selection.
  Space toggles the focused row; Enter replaces selection with the focused row.
  Ctrl/Cmd+click toggles mouse selection and Shift+click extends a visible-row
  range.
- Collapse state is UI-only. It is local during P1 and persisted as a per-project
  preference during P2.
- Bone, slot, image, point, and rectangle rows have distinct icons and accessible
  type labels. Indentation represents actual ancestry.

### Inspector and key controls

- Numeric drafts commit on Enter or blur. Escape restores the last committed
  value. Invalid drafts stay visible with an inline error and do not dispatch a
  command.
- Enter followed by blur must dispatch at most one command. A value equal to the
  committed value dispatches no command.
- A hollow diamond adds a key at the current frame. A filled diamond removes the
  key at that frame. An amber diamond represents a pending edit while Auto Key is
  off. Accessible labels state the property, frame, and action.
- Removing a current-frame key uses existing recoverable history and does not
  require a destructive confirmation.
- Explicit `Add track` remains available for discrete/advanced tracks, but
  keying an animatable inspector property creates its track automatically.

### Timeline

- The dopesheet has an overview row, entity group rows, and property rows.
- Clicking a key selects it and seeks to its frame. Ctrl/Cmd+click toggles it.
- Clicking the ruler or empty lane seeks. Dragging selected keys retimes them by
  whole frames; keys cannot overlap another key on the same track.
- Empty-lane dragging creates a marquee. Ctrl/Cmd adds to the current selection.
- Copy/paste uses an application-local typed key clipboard. Paste preserves
  relative offsets with the earliest copied key placed at the playhead. A paste
  that would exceed clip bounds or collide on a track is rejected atomically
  with a useful message.
- Delete removes selected keys. Arrow Left/Right nudges selected keys by one
  frame when timeline focus is active. All multi-key changes are one history
  transaction.
- P1 provides `Selection` and `All keyed` row modes. P2 adds individually pinned
  rows.

### UI preferences and editor visibility

- P2 stores versioned UI preferences under a dedicated local-storage key and
  validates them at runtime before use.
- Project-specific preferences are keyed by `Project.id`; invalid or stale entity
  IDs are ignored.
- Editor visibility affects only authoring display and hit testing. It does not
  alter setup pose, animation evaluation, project validation, history, archive
  data, or export.

## P1: direct structure and keying

### Foundations and workspace composition

- [x] **UX-P1-01** Add post-P0 characterization coverage. Capture current
  Setup/Animate behavior for selection, hierarchy drag/drop, transform commits,
  Auto Key, explicit keying, key/event detail surfaces, timeline resizing, and
  export overlay containment. Add P1 tests separately rather than weakening P0
  assertions.

- [x] **UX-P1-02** Extract editor presentation boundaries from `App.tsx` without
  changing behavior. Depends on UX-P1-01. Introduce focused components for the
  workspace docks, Rig tree, Properties inspector, asset browser, canvas toolbar,
  and Animate timeline. Keep project mutation orchestration in the shell and pass
  typed callbacks/value objects to presentation components.

- [x] **UX-P1-03** Recompose the fixed workspace docks. Depends on UX-P1-02.
  Move Rig/Draw Order to the left and Properties/Assets to the right using
  accessible tabs. Preserve independent scrolling, focus restoration, asset
  import, asset selection, and every drag/drop target. Active tabs remain local
  UI state until P2.

- [x] **UX-P1-04** Add reusable accessible menu, popover, tooltip, and toolbar
  primitives. Depends on UX-P1-02. Follow the WAI-ARIA
  [menu button](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/),
  [dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/), and
  [toolbar](https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/) patterns. Cover
  Escape dismissal, outside interaction where appropriate, roving focus, focus
  restoration, and viewport collision handling.

### Rig and draw order

- [x] **UX-P1-05** Build a pure Rig tree view model. Depends on UX-P1-02. Derive
  immutable nodes with entity type, parent, depth, ordered children, display
  name, selected state, active-attachment state, and expandability. Add unit
  tests for nested bones, slots, image attachments, point/rectangle attachments,
  empty branches, and malformed references already reported by validation.

- [x] **UX-P1-06** Render the expandable semantic Rig tree. Depends on UX-P1-05.
  Implement disclosure controls, roving focus, the resolved keyboard/mouse
  selection model, and type-ahead. Collapsing a branch hides descendants without
  clearing their project selection. Expanding/revealing must not mutate history.

- [x] **UX-P1-07** Add durable tree row visuals and annotations. Depends on
  UX-P1-06. Replace text glyphs with consistent icons and non-color-only states
  for hover, focus, selection, multi-selection, active slot attachment, and drag
  target. Tooltips/accessibility text identify entity type and relevant relation.

- [x] **UX-P1-08** Replace ambiguous Rig creation controls with a contextual Add
  menu. Depends on UX-P1-04 and UX-P1-06. Menu contents follow selection: root
  bone, child bone, slot, image attachment workflow, point, or rectangle.
  Unavailable items explain their required context. Preserve unique naming and
  existing commands/history.

- [ ] **UX-P1-09** Build the separate Draw Order tab. Depends on UX-P1-03. Show
  every slot in clearly labelled back-to-front order with direct drag reordering
  in Setup mode. In Animate mode, show whether the displayed order comes from
  setup or a current keyed override and provide an explicit current-frame key
  action. Reuse existing setup and keyed draw-order commands.

- [ ] **UX-P1-10** Synchronize project selection across Rig, Draw Order, canvas,
  and timeline rows. Depends on UX-P1-06 and UX-P1-09. Selecting from canvas or
  timeline reveals the entity in the Rig tree. Selecting a Draw Order row selects
  its slot everywhere. Avoid feedback loops and preserve additive selection.

### Properties and direct keying

- [x] **UX-P1-11** Add pure property draft parsing and commit helpers. Depends on
  UX-P1-02. Model display units, valid ranges, committed value, draft text, and
  parse errors for transforms, opacity, pivot, and rectangle size. Add unit tests
  for blank, nonfinite, out-of-range, unchanged, and converted degree values.

- [x] **UX-P1-12** Convert name and numeric properties to direct commits. Depends
  on UX-P1-11. Commit on Enter/blur, revert on Escape, show inline errors, and
  remove `Rename`/`Apply values` buttons once equivalent browser coverage passes.
  Each field commit is one history entry; invalid or unchanged drafts produce
  none. Preserve Auto Key and pending-edit behavior.

- [x] **UX-P1-13** Extract pure current-frame key state and command planning.
  Depends on UX-P1-11. Given project, clip, target, property, frame, Auto Key, and
  pending edits, derive the diamond state and the exact create-track/add-key/
  delete-key commands. Cover every continuous property type and missing-clip
  state with unit tests.

- [x] **UX-P1-14** Replace verbose inspector key labels with interactive key
  diamonds. Depends on UX-P1-12 and UX-P1-13. Use hollow, filled, and amber
  shapes plus accessible text. Clicking adds/removes the current-frame key in one
  history transaction. Keep the compact pending-edit action near Auto Key and
  announce pending/keyed state changes without moving focus.

- [x] **UX-P1-15** Automatically create continuous tracks from property keying.
  Depends on UX-P1-13. Inspector keying and Auto Key create a missing compatible
  track before setting its key. Keep explicit track creation for attachment
  swaps, draw order, enabled state, and other discrete tracks. Prevent duplicate
  tracks through the existing domain validation.

### Grouped dopesheet and direct key manipulation

- [x] **UX-P1-16** Replace the flat timeline row model with a pure grouped model.
  Depends on UX-P1-02. Derive overview, entity group, property, Draw Order, and
  Events rows with stable IDs, depth, expansion state, key summaries, and target
  entity references. Support `Selection` and `All keyed` modes and existing text
  filtering. Add comprehensive row-model tests.

- [ ] **UX-P1-17** Render the grouped dopesheet. Depends on UX-P1-16. Keep the
  ruler and row-label column sticky, make entity/property groups collapsible,
  show aggregate keys in overview/group rows, and retain clear shapes/line styles
  for continuous, stepped, attachment, draw-order, enabled, and event data.

- [ ] **UX-P1-18** Add direct ruler/lane seeking and cross-surface selection.
  Depends on UX-P1-10 and UX-P1-17. Clicking ruler or empty lane sets the
  playhead; clicking a key selects and seeks; clicking a property label selects
  the related entity and appropriate transform tool where applicable. Preserve
  keyboard accessibility and existing frame bounds.

- [x] **UX-P1-19** Add pure key-drag planning. Depends on UX-P1-16. Convert
  pointer deltas to frame deltas, clamp the entire selection to clip bounds,
  detect same-track collisions before mutation, and generate immutable retime
  inputs. Add tests for single/multi-track selections, negative movement, bounds,
  collisions, and no-op drags.

- [ ] **UX-P1-20** Implement direct key dragging. Depends on UX-P1-18 and
  UX-P1-19. Use pointer capture and a movement threshold so click remains select.
  Preview movement without mutating project state, then commit all keys as one
  history transaction. Escape/pointer cancellation restores the original state.

- [ ] **UX-P1-21** Add timeline marquee and range selection. Depends on
  UX-P1-18. Dragging empty key-lane space selects intersecting visible keys;
  Ctrl/Cmd adds to selection. Ensure the marquee coexists with seeking, key
  dragging, vertical scrolling, and timeline resizing.

- [ ] **UX-P1-22** Add typed key clipboard and standard key commands. Depends on
  UX-P1-19. Implement Ctrl/Cmd+C, Ctrl/Cmd+V, Delete, and Arrow Left/Right only
  while timeline context is active and not while typing. Validate multi-key paste
  atomically, allocate fresh IDs, preserve relative timing, and commit paste,
  delete, or nudge as one history entry.

- [ ] **UX-P1-23** Reduce timeline detail surfaces to precision/advanced editing.
  Depends on UX-P1-14 and UX-P1-20 through UX-P1-22. Keep numeric frame/value,
  interpolation, Bezier, attachment, draw-order, enabled, and event details, but
  remove duplicate Move/Copy/Delete form actions now covered directly. Detail
  surfaces must track the current selection and restore focus predictably.

### Application feedback and discoverability

- [x] **UX-P1-24** Add autosave lifecycle reporting. Extend the autosave
  scheduler with typed scheduled/saving/saved/error callbacks and tests. Show
  `Saving...`, `Saved locally`, or `Save failed` beside the project name without
  adding project history or layout movement. A later successful save clears the
  failure state.

- [ ] **UX-P1-25** Add the Project menu. Depends on UX-P1-04 and UX-P1-24.
  Provide New, Open recent, Import `.boneanim`, Export project archive, Load
  example, and Project settings. Reuse existing repository/archive services,
  validate imports before replacing the active project, distinguish archive
  export from sprite-sheet Export, and retain confirmation rules for replacement.
  Project settings in P1 edits the project name through the existing command and
  displays the fixed logical canvas; it does not introduce new project-schema or
  export-setting behavior.

- [ ] **UX-P1-26** Add consistent action tooltips and menu semantics. Depends on
  UX-P1-04. Every icon-only action exposes a visible tooltip on hover/focus with
  action and shortcut where one exists. Do not duplicate essential labels only
  in tooltips. Audit `aria-expanded`, `aria-haspopup`, pressed/selected states,
  Escape behavior, and focus return for every contextual surface.

- [ ] **UX-P1-27** Complete the P1 regression and documentation gate. Depends on
  UX-P1-07 through UX-P1-26. Add focused unit tests and a new P1 Playwright suite;
  retain P0 layout tests unchanged. Update hierarchy, selection, draw order,
  transform inspector, keyboard, animate timeline, archive/recovery, and layout
  documents. Run the completion commands and the P1 exit workflow.

## P1 acceptance matrix

| Area | Required result |
| --- | --- |
| Workspace | Rig/Draw Order are left; Properties/Assets are right; P0 containment remains intact. |
| Rig | Nested entities expand/collapse, expose type/relationship, support keyboard and multi-selection, and retain safe drag/drop. |
| Draw order | Setup order is directly reorderable and Animate clearly distinguishes setup from keyed order. |
| Inspector | Name and numeric edits commit without Apply/Rename buttons; invalid drafts never mutate state. |
| Keying | Every continuous property has an actionable, non-color-only current-frame key diamond. |
| Tracks | Continuous tracks are created automatically when keyed; explicit advanced tracks remain available. |
| Timeline | Grouped rows, overview, direct seek, drag, marquee, copy/paste, delete, and frame nudge work without forms. |
| Selection | Rig, Draw Order, canvas, inspector, and timeline remain synchronized without loops. |
| Persistence | Save lifecycle is visible; archive/project actions are distinct from sprite-sheet export. |
| Accessibility | Tree, menus, dialogs, tabs, toolbar, tooltips, and key controls are keyboard-operable with correct focus behavior. |

## P1 exit workflow

Using a new project at 1120 x 720:

1. Import image parts and create a root plus child bone from the Rig Add menu.
2. Drag images to create two slots/attachments and inspect the nested tree.
3. Reorder slots in Draw Order, then select the child bone from the canvas and
   confirm it is revealed in the Rig tree.
4. Edit X and Rotation by field commit without an Apply button.
5. Switch to Animate, create a clip, and use key diamonds to make a two-pose
   animation without opening Add track.
6. Drag one pose, marquee both poses, copy/paste them at the playhead, nudge the
   pasted keys, and undo each operation.
7. Play the clip and confirm the save state reaches `Saved locally`.
8. Export and re-import a `.boneanim` archive from the Project menu, then open
   sprite-sheet Export and confirm the two workflows are unmistakable.

P1 is complete when this workflow succeeds without `Apply values`, `Add track`,
or `Move key`, and without document scrolling.

## P2: efficiency and customization

### Layout preferences and dock customization

- [x] **UX-P2-01** Define a versioned UI-preference schema and storage adapter.
  Runtime-validate global and per-project preferences from local storage, apply
  safe defaults on malformed/unsupported data, ignore stale entity IDs, and add
  round-trip/migration/failure tests. Preferences must never enter project
  history, repository snapshots, archives, or exports.

- [x] **UX-P2-02** Generalize P0 timeline sizing into an immutable workspace
  layout model. Depends on UX-P2-01. Add left/right dock widths, timeline height,
  collapsed dock state, and clamping for all supported viewports. Keep pure
  calculations separate from pointer/DOM handling and cover edge cases by unit
  test.

- [x] **UX-P2-03** Add accessible side-dock splitters and collapse controls.
  Depends on UX-P2-02. Pointer and keyboard resizing must preserve the minimum
  usable canvas, remain within the viewport, and not create project history.
  Restore sensible defaults when a saved layout cannot fit the current viewport.

- [x] **UX-P2-04** Persist and restore workspace presentation state. Depends on
  UX-P2-03. Save dock widths, timeline height, active dock tabs, collapsed
  sections, Rig expansion, timeline row mode/expansion, and density settings.
  Debounce writes, handle storage failure silently but testably, and apply
  project-specific state only to the matching `Project.id`.
  Shared and direct inspector disclosures are wired to this project-scoped
  state and covered by `tests/e2e/p2-inspector.spec.ts`.

### Asset and import efficiency

- [x] **UX-P2-05** Add list/compact/thumbnail asset density modes. Depends on
  UX-P2-04. Generate thumbnail object URLs from existing asset blobs, revoke them
  when assets or component lifetime change, preserve folder hierarchy/search,
  and avoid decoding offscreen assets unnecessarily. Selection and drag behavior
  must be identical in every density.

- [x] **UX-P2-06** Add asset preview and usage metadata. Depends on UX-P2-05.
  On hover/focus/selection show image dimensions, format, relative path, and the
  slots/attachments using the asset. Preview surfaces must not steal focus or
  obscure the drop target.

- [x] **UX-P2-07** Clarify import and drop outcomes. Depends on UX-P2-05. Before
  drop, indicate whether the action will create a slot/attachment under the
  selected bone or add an attachment to an existing slot. After import, show a
  bounded nonmodal count of imported/skipped/conflicting files with accessible
  details.

### Rig efficiency and editor-only visibility

- [ ] **UX-P2-08** Add inline Rig rename. Depends on UX-P1-06 and UX-P2-04.
  Double-click or F2 enters an inline field; Enter/blur commits, Escape cancels,
  and focus returns to the row. Preserve unique-name validation and one history
  entry. Inspector naming remains synchronized.

- [x] **UX-P2-09** Add editor-only visibility controls. Depends on UX-P1-07 and
  UX-P2-01. Store hidden bone/attachment IDs per project preference, exclude
  hidden items from authoring rendering and hit testing, and leave pose/export
  evaluation unchanged. Parent visibility may hide descendants visually without
  rewriting each descendant preference.

- [ ] **UX-P2-10** Add selection history and reliable reveal. Depends on
  UX-P1-10. Record explicit entity selections in bounded immutable UI history;
  Page Up/Page Down navigate backward/forward, expanding ancestors and scrolling
  the row into view. Ignore removed entities and do not add history entries while
  replaying selection history.

- [ ] **UX-P2-11** Add Rig search/filter for larger projects. Depends on
  UX-P1-06. Match names and types while preserving enough ancestors to show
  context. Clearly distinguish a filtered-out branch from a collapsed branch and
  restore the prior expansion/focus state when the filter clears.

### Canvas efficiency

- [x] **UX-P2-12** Resolve canvas navigation gestures. Reserve primary drag for
  select/marquee/transform, use middle-drag and Space+primary-drag for pan, and
  retain pointer-anchored wheel zoom. Escape cancels the active gesture before it
  clears selection. Add unit and browser coverage for gesture precedence.

- [x] **UX-P2-13** Refine canvas overlays. Depends on UX-P2-12. Move zoom/frame
  controls and coordinate readout to a compact corner overlay, move grid settings
  into a labelled popover, add a setup-origin marker, and keep logical canvas/
  pasteboard boundaries clear. Verify no collision with tools, warnings, handles,
  or P0 detail surfaces.

- [x] **UX-P2-14** Add transform constraints and feedback. Depends on UX-P2-12.
  Use Shift for supported axis, angle, and aspect constraints; show the active
  constraint in a status line; keep one history transaction per gesture; and add
  pure transform-gesture tests for constrained values.

- [ ] **UX-P2-15** Add transform and selection shortcuts. Depends on UX-P2-08,
  UX-P2-10, and UX-P2-12. Adopt one documented tool mapping, F2 rename, Escape,
  Delete, and K keying semantics. Keep shortcuts inactive while typing, expose
  every action by mouse, update tooltips/reference, and add shortcut routing
  tests. Do not support competing hidden mappings.

### Shared inspector and advanced animation workflows

- [ ] **UX-P2-16** Introduce a typed shared inspector context. Depends on
  UX-P1-10 and UX-P1-23. Represent entity, clip, key selection, event, draw order,
  and attachment-swap contexts without merging them into project entity
  selection. Move contextual editing from timeline dialogs into right-dock
  Properties while preserving focus, selection, and existing commands.

- [ ] **UX-P2-17** Refine clip/key/interpolation inspection. Depends on
  UX-P2-16. Show clip FPS/duration/loop when clip context is active; show frame,
  value, interpolation, and Bezier controls for selected keys; support mixed
  multi-key state; and retain timeline popovers only for small creation menus.

- [ ] **UX-P2-18** Refine event inspection. Depends on UX-P2-16. Selecting an
  event opens name, frame, and payload in Properties with inline JSON validation.
  Add/move/delete remain one command each, timeline marker selection stays
  synchronized, and errors do not discard the last valid payload.

- [ ] **UX-P2-19** Refine draw-order and attachment-swap inspection. Depends on
  UX-P2-16. Edit the evaluated current order and keyed slot attachment from
  Properties, clearly distinguish setup/current/keyed values, and provide direct
  navigation to the related slot/attachment without losing timeline context.

- [ ] **UX-P2-20** Refine point and rectangle inspection. Depends on UX-P2-16.
  Group gameplay name, transform, enabled state, and rectangle size; display
  setup/current/keyed distinctions; keep valid ranges/units visible; and preserve
  world-space export behavior.

- [ ] **UX-P2-21** Add useful multi-entity property editing. Depends on
  UX-P2-16. Derive shared/mixed transform and opacity values for compatible
  selections. Committing a field applies an immutable delta or common value to
  every supported entity in one history transaction. Hide or disable properties
  unsupported by the full selection with an explanation.

- [ ] **UX-P2-22** Add individually pinned timeline rows. Depends on UX-P1-16 and
  UX-P2-04. Pin/unpin entity groups while in Selection mode, keep pins when
  project selection changes, ignore removed targets, expose a clear-all action,
  and persist pins per project. Pinned rows retain selection synchronization.

### P2 release gate

- [ ] **UX-P2-23** Complete keyboard and accessibility audit. Depends on
  UX-P2-03 through UX-P2-22. Verify logical focus order, roving focus, visible
  focus, state names, non-color cues, menu/dialog dismissal, tooltip behavior,
  scroll-to-focus, and no shortcut interception in editable controls.

- [ ] **UX-P2-24** Add task-based efficiency coverage. Depends on UX-P2-23.
  Create focused unit tests plus a P2 Playwright suite for preference recovery,
  dock resizing, density modes, inline rename, visibility/export isolation,
  selection history, canvas gestures, shared inspectors, multi-edit, and pinned
  rows. Keep the full P0/P1 suites passing at every supported viewport.

- [ ] **UX-P2-25** Update documentation and run the final UX gate. Depends on
  UX-P2-24. Update layout, hierarchy, assets, selection, viewport navigation,
  transform handles/inspector, timeline, events, gameplay attachments, draw
  order, keyboard, persistence/recovery, and deferred-feature documents. Run the
  completion commands and the P2 exit workflow.

## P2 acceptance matrix

| Area | Required result |
| --- | --- |
| Layout | Side docks and timeline resize accessibly, clamp safely, and restore per saved preferences. |
| Preferences | Malformed/stale storage falls back safely and never changes project/archive/export data. |
| Assets | Density, thumbnails, preview, usage, import summary, and explicit drop result preserve existing asset behavior. |
| Rig | Inline rename, editor visibility, search, and selection history work without corrupting selection or hierarchy. |
| Canvas | Selection/transform gestures no longer conflict with pan; constraints and overlays remain discoverable. |
| Inspector | Clip, keys, events, draw order, attachment swaps, gameplay objects, and compatible multi-selection share one coherent surface. |
| Timeline | Pinned rows remain synchronized and persist per project without becoming project data. |
| Shortcuts | Tools, rename, selection, deletion, keying, and navigation are documented, scoped, and form-safe. |
| Scope | Pose evaluation, archives, sprite-sheet pixels/metadata, and deferred-feature boundaries are unchanged. |

## P2 exit workflow

Using the bundled example and a second new project:

1. Resize both side docks and the timeline, choose asset thumbnail mode, reload,
   and confirm each project restores only its own presentation state.
2. Rename `arm` inline, hide it in the editor, confirm it is not hit-testable,
   and verify export still contains its unchanged evaluated animation.
3. Navigate selection history, filter/reveal the Rig tree, then pin the arm and
   body timeline groups while changing canvas selection.
4. Pan with Space+drag, marquee with primary drag, constrain a rotation, and
   switch tools using the documented shortcuts.
5. Edit a key/Bezier curve, event payload, draw order, attachment swap, point,
   and rectangle through Properties without losing timeline context.
6. Multi-select compatible entities, apply a shared transform change, undo once,
   and confirm the entire edit reverses.
7. Corrupt the UI-preference storage entry, reload, and confirm safe defaults,
   intact project recovery, no document overflow, and no export differences.

P2 is complete when repeated posing/timing work can stay within the Rig, canvas,
Properties, and dopesheet surfaces and configuration appears only on request.

## Completion commands

```sh
git diff --check
bun run check
bun run test:e2e
```
