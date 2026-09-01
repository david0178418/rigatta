# UX P0 task list v1

## Objective

Implement the P0 portion of [UX usability pass v1](./ux-usability-pass-v1.md):
restore a contained desktop-editor shell, keep animation controls immediately
reachable, move transform tools next to the canvas, and prevent configuration
forms from displacing the dopesheet.

Tasks are ordered by dependency. A task is complete only when its
implementation, automated tests, and affected documentation are updated
together.

## Scope

P0 includes:

- a viewport-height application shell with no normal document scrolling;
- independent overflow for the asset dock, hierarchy/inspector dock, and
  timeline;
- a vertically resizable Animate timeline;
- a compact Setup-mode timeline state;
- persistent placement of Move, Rotate, Scale, and Shear beside the canvas;
- a timeline layout that shows transport, ruler, and dopesheet before optional
  clip, track, key, and event configuration;
- regression coverage at 1120 x 720, 1280 x 800, 1440 x 900, and 1920 x 1080.

P0 must preserve all existing project mutations, history behavior, keyboard
shortcuts, selection behavior, key editing, event editing, validation, playback,
and export behavior.

P0 does not include the P1 tree redesign, Draw Order tab, immediate inspector
field commits, compact key diamonds, grouped dopesheet rows, direct key dragging,
new timeline selection semantics, project menu, asset thumbnails, or new
shortcuts. It also does not add deferred product features such as IK,
constraints, meshes, skins, audio, onion skinning, multiple rigs, or runtime
skeletal export.

## Resolved P0 interaction decisions

These decisions remove implementation ambiguity while leaving the broader P1
design open:

- The application shell occupies `100dvh`; the browser document is not the
  editor's scroll container.
- The top toolbar remains fixed at the top. The workspace and timeline share the
  remaining height.
- Setup mode uses a compact timeline/status row rather than a 190 px empty dock.
- Animate mode starts with a 260 px timeline. The user can drag its top edge to
  resize it between 190 px and 55% of the shell height.
- Timeline height is component-local UI state in P0. Persisting layout
  preferences is deferred to P2.
- The timeline header, clip selector, playback controls, current-frame readout,
  Auto Key, timeline navigation, ruler, and dopesheet are always above optional
  editing details.
- Existing clip settings, track creation, key creation/editing, Bezier editing,
  and event editing open in contextual detail panels or popovers. They are
  closed by default and must not add to the timeline's minimum content height.
  This is a layout relocation only; their domain behavior does not change.
- The existing playhead range remains directly below the dopesheet until a later
  task merges scrubbing into the ruler.
- Move, Rotate, Scale, and Shear move to a persistent canvas-edge toolbar. Their
  state and transform behavior remain unchanged, and no new tool shortcuts are
  introduced in P0.
- Export and shortcut overlays remain viewport-fixed and must not participate in
  dock sizing or scrolling.

## Tasks

### Shell and dock containment

- [x] **UX-P0-01** Add failing layout regression coverage for vertical overflow.
  Extend `tests/e2e/layout.spec.ts` to load the example, select a transformable
  entity with a full inspector, enter both Setup and Animate modes, and record
  the viewport matrix defined in this document. Assert that the document's
  scroll width and height do not exceed the viewport. Also assert that the
  timeline toolbar and a dopesheet track row are visible in Animate mode.

- [x] **UX-P0-02** Convert the application shell to a bounded viewport-height
  grid. Depends on UX-P0-01. Update the root/body/shell layout so the shell has a
  definite `100dvh` height, grid children use `min-height: 0` and `min-width: 0`,
  and normal editor content cannot grow the document. Preserve the current
  minimum supported desktop size and horizontal-overflow behavior.

- [x] **UX-P0-03** Establish independent side-dock scrolling. Depends on
  UX-P0-02. Keep the asset library and the combined hierarchy/inspector dock
  usable when their content exceeds the workspace height. Scrolling one dock
  must not move the canvas, top toolbar, other dock, or timeline. Selection and
  focus must remain visible when controls are reached by keyboard.

- [x] **UX-P0-04** Make the viewport region absorb remaining workspace space.
  Depends on UX-P0-02. Ensure the viewport toolbar, warnings, stage, Pixi canvas,
  and canvas overlays remain contained as the timeline changes height. Preserve
  the fixed logical canvas aspect ratio and export-independent navigation. At
  minimum size, the stage may reduce its rendered size but must not force shell
  overflow.

### Timeline sizing and information order

- [x] **UX-P0-05** Extract timeline height and resize calculations into pure,
  typed helpers. Depends on UX-P0-02. Define the Animate default, minimum, and
  maximum height rules; clamp pointer-driven changes; and keep the calculations
  independent of React and DOM mutation where practical. Add focused unit tests
  for clamping at every supported viewport height.

- [x] **UX-P0-06** Add an accessible timeline splitter and Animate-mode resizing.
  Depends on UX-P0-05. Place a visible drag handle on the timeline's top edge.
  Pointer dragging must resize continuously without selecting page text and
  without changing project history. Give the separator an accessible name,
  `role="separator"`, horizontal orientation, current/min/max values, and an
  `aria-controls` reference to the timeline pane. Support keyboard increments
  using Arrow Up/Down, Home, and End, following the
  [WAI-ARIA window splitter pattern](https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/).

- [x] **UX-P0-07** Introduce the compact Setup-mode timeline row. Depends on
  UX-P0-02. Replace the current 190 px Setup footer with a small fixed row that
  shows the Timeline label, clip count, and existing guidance when no clips
  exist. Do not show Animate-only transport or key controls. Switching modes
  must preserve project selection, active clip, playback state, and viewport
  navigation.

- [x] **UX-P0-08** Separate the Animate timeline into sticky controls and a
  scrollable content region. Depends on UX-P0-06. Keep the active clip control,
  playback controls, frame/time readout, Auto Key action, navigation/filter
  controls, ruler, dopesheet, event row, and playhead reachable without scrolling
  the browser document. Row labels and the frame ruler must remain aligned during
  timeline scrolling.

- [x] **UX-P0-09** Move clip management and playback settings into a contextual
  Clip details surface. Depends on UX-P0-08. Keep clip selection and creation in
  the sticky timeline controls. Move rename, duplicate, delete, duration, FPS,
  and loop editing behind one clearly labeled Clip settings/details action.
  Preserve existing confirmations, validation, focus behavior, commands, and
  history transactions. Opening the surface must not shift the dopesheet below
  the visible timeline area.

- [x] **UX-P0-10** Move track and key configuration into contextual detail
  surfaces. Depends on UX-P0-08. Relocate the New track select, explicit Add key
  form, selected-key frame/interpolation controls, multi-key retime controls,
  attachment/draw-order key editors, and Bezier graph. The surfaces appear only
  when requested or when an applicable key/selection is active, remain within
  the viewport, return focus to their trigger when closed, and preserve all
  existing typed command paths.

- [x] **UX-P0-11** Move event creation and editing into a contextual Event
  details surface. Depends on UX-P0-08. Keep the Events row visible in the
  dopesheet. Add Event remains available from that row; selected-event name,
  payload, frame, and delete controls move out of the timeline's normal vertical
  flow. Preserve JSON validation and existing event history behavior.

- [x] **UX-P0-12** Keep diagnostics and status feedback visible without growing
  the shell. Depends on UX-P0-08 through UX-P0-11. Place validation diagnostics
  and command/persistence/asset errors in bounded, independently scrollable or
  dismissible regions. Status feedback must not resize the document or cover the
  active transform and playback controls.

### Canvas tool access

- [x] **UX-P0-13** Move transform tool selection to a persistent canvas-edge
  toolbar. Depends on UX-P0-04. Render Move, Rotate, Scale, and Shear beside the
  viewport regardless of inspector scroll position or selection type. Preserve
  the existing active-tool state, pressed semantics, labels, hit testing,
  transform transactions, and disabled behavior. Remove the duplicate tool row
  from the inspector after browser coverage confirms the new placement.

- [x] **UX-P0-14** Verify tool and overlay collision behavior. Depends on
  UX-P0-13. Ensure the transform toolbar does not overlap grid controls, canvas
  warnings, zoom controls, marquee selection, renderer errors, or export/
  shortcut overlays at any supported viewport. Controls must remain keyboard-
  reachable and meet the project's existing focus-visible treatment.

### Regression and documentation gate

- [x] **UX-P0-15** Add P0 interaction browser coverage. Depends on UX-P0-03,
  UX-P0-06 through UX-P0-14. With the example project at each supported
  viewport, verify that a user can select `arm`, choose Rotate, edit a transform,
  switch to Animate, scrub to another frame, access a key's details, and start
  playback without document scrolling. Exercise timeline resizing by pointer and
  keyboard, and verify independent side-dock/timeline scrolling.

- [x] **UX-P0-16** Update layout and interaction documentation. Depends on
  UX-P0-15. Update `docs/layout-qa-v1.md` with vertical-containment assertions,
  `docs/viewport-navigation-v1.md` if canvas tool placement affects documented
  controls, `docs/keyboard-shortcuts-v1.md` if separator keys require mention,
  and the relevant timeline/transform documents. Record that layout preference
  persistence and the broader P1/P2 changes remain deferred.

- [x] **UX-P0-17** Run the complete P0 release gate. Depends on UX-P0-16. Run
  formatting/whitespace checks, the Bun project check, and the full Playwright
  suite. Manually repeat the P0 exit workflow in current desktop Chrome at the
  four viewport sizes. Record any Chrome-only behavior or residual usability
  limitation in the affected document before marking P0 complete.

## Acceptance matrix

| Area | Required result |
| --- | --- |
| Shell | Document width and height remain within the viewport during normal editing. |
| Side docks | Long assets and a full selected-entity inspector scroll without moving other regions. |
| Setup | Compact timeline row leaves the majority of the shell to the workspace. |
| Animate | Timeline toolbar, ruler, at least one track row, and playback are immediately reachable. |
| Resizing | Pointer and keyboard resize stay between 190 px and 55% of shell height. |
| Timeline details | Clip, track, key, Bezier, draw-order, attachment, and event editing remain available without preceding/displacing the dopesheet. |
| Canvas tools | Move, Rotate, Scale, and Shear remain visible beside the canvas while inspector content scrolls. |
| State | Mode changes and UI resizing do not create project-history entries or alter export data. |
| Overlays | Export, shortcut, warning, error, and detail surfaces remain within the viewport and restore focus correctly. |
| Viewports | All requirements pass at 1120 x 720, 1280 x 800, 1440 x 900, and 1920 x 1080. |

## P0 exit workflow

Using the bundled Cutout Robot example:

1. Load the example in Setup mode.
2. Select `arm` and scroll through every inspector field without moving the
   canvas or browser document.
3. Select Rotate from the canvas toolbar and apply a transform.
4. Switch to Animate and confirm that playback, the ruler, and the arm rotation
   track are visible without document scrolling.
5. Scrub to frame 7, open the selected key details, inspect interpolation, and
   close the details surface.
6. Resize the timeline to its minimum and maximum with pointer and keyboard.
7. Start and stop playback, then switch back to Setup.
8. Confirm that the selected entity and viewport navigation are preserved and
   that undo history contains only the transform mutation.

## Completion commands

```sh
git diff --check
bun run check
bun run test:e2e
```

## Execution record

Completed 2026-09-01. The implementation uses a bounded `100dvh` shell,
independently scrollable docks, a 260 px local Animate timeline height with a
190 px to 55% splitter range, compact Setup status, persistent canvas tools,
and contextual Animate detail surfaces. `tests/e2e/layout.spec.ts` covers
1120 × 720, 1280 × 800, 1440 × 900, and 1920 × 1080, including the exit
workflow, focus restoration, pointer/keyboard resizing, and long-asset,
inspector, and dopesheet scrolling. Layout height is intentionally not
persisted; P1/P2 scope remains deferred.
