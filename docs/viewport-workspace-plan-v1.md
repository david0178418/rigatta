# Viewport workspace implementation plan v1

Status: completed — full validation is green for the tested scope; residual evidence gaps are recorded below.

This closeout describes the implementation present in the current worktree. A
checked item means that the behavior is implemented and covered by current unit
or browser evidence. Unchecked items are intentionally left unclaimed when the
behavior is not implemented in this slice or when the current tests do not
verify the required runtime or rendered-pixel result.

## Goal

Make the entire center editor region behave as the navigable viewport users
expect from animation and DCC tools. The fixed logical canvas remains the
project's export boundary, but becomes content inside the viewport rather than
the viewport itself.

The result should let users pan, zoom, select, transform, marquee, and drop
assets anywhere in the visible workspace. The logical canvas remains visually
distinct and fixed in project coordinates. Editor navigation must not change
project data or exported pixels.

## Current problem

The current layout exposes two nested surfaces:

- `.viewport-stage` fills the available center workspace and paints the outer
  checkerboard, but it does not receive canvas navigation gestures.
- `.pixi-viewport` is a centered square capped at 640 CSS pixels. It is both the
  pointer interaction boundary and the display area for the fixed Pixi renderer.
- The Pixi canvas is scaled to fill that square regardless of its logical pixel
  dimensions, while screen-to-logical coordinate conversion assumes a direct
  camera scale. This makes the view model harder to reason about and can make
  display scale and interaction scale diverge.
- Content outside the fixed renderer dimensions is clipped in both the editor
  and export, even though authoring warnings distinguish partially and fully
  out-of-bounds attachments.

The visually available pasteboard is therefore mostly inert. Users can only
begin pan, zoom, marquee, drop, or pointer-coordinate interactions inside the
smaller square.

## Product decisions

These decisions are part of this plan and should not be reopened during
implementation unless a technical constraint invalidates one of them.

1. The entire center region below warnings is the interactive viewport.
2. The logical canvas is a rectangle in world space with origin `(0, 0)` and
   the project's existing width and height. It is not a DOM clipping boundary.
3. The logical canvas uses a transparency checkerboard. The surrounding
   pasteboard uses a quieter solid background so the export boundary is clear.
4. Attachments, bones, handles, and gameplay guides outside the logical canvas
   remain visible and editable on the pasteboard. Export continues to clip them.
5. Middle-drag and Space+primary-drag pan from any viewport point. Wheel zoom is
   anchored at the pointer anywhere in the viewport. Primary drag retains its
   existing select, marquee, and transform meanings.
6. Drops are accepted throughout the viewport. A pasteboard drop produces the
   corresponding negative or out-of-range logical coordinates and the existing
   canvas warning reports the result.
7. `Fit` frames the complete logical canvas with a 32 CSS pixel minimum inset,
   after accounting for viewport overlays. `100%` means one logical pixel equals
   one CSS pixel. These are separate actions.
8. The initial camera is fitted. A resize refits while the camera is still in
   fit mode; after manual navigation, resize preserves the logical point at the
   viewport center.
9. Camera and gesture state remain UI-only. They do not enter project history,
   autosave data, UI preference persistence, archives, pose evaluation, or
   export metadata. Setup/Animate mode changes preserve the mounted camera.
10. The existing fixed logical canvas, top-left origin, export schemas, sampled
    rendering, and clipping diagnostics remain unchanged.

## Target structure

The center surface should have one interaction boundary and two rendering
responsibilities:

```text
viewport panel
└── interactive viewport (fills available center area; clips at panel edge)
    ├── editor Pixi surface (viewport-sized)
    │   └── camera container (world-space scene, not export-clipped)
    ├── camera-aligned DOM overlays (canvas edge, origin, marquee/handles)
    ├── transform toolbar
    └── coordinate and Fit/100%/zoom controls

fixed export renderer (logical-canvas-sized, export-clipped, not the camera)
```

The editor and exporter may share pure scene-description or render-instance
functions, but they must not share viewport dimensions or clipping behavior.
Pixi lifecycle mutation stays isolated inside rendering adapters.

## Camera contract

Replace the implicit CSS fit with one explicit immutable camera model:

```ts
type ViewportCamera = Readonly<{
	scale: number;
	offsetX: number;
	offsetY: number;
	mode: 'fit' | 'manual';
}>;
```

- `scale` is the effective CSS-pixels-per-logical-pixel scale. The displayed
  percentage is `scale * 100`, so `100%` always has a literal meaning.
- `offsetX` and `offsetY` are screen-pixel offsets from centered canvas
  placement.
- Screen/world conversion, anchored zoom, fit, actual size, pan, marquee bounds,
  selection hit testing, transform gestures, coordinate readout, and drops all
  consume the same viewport rectangle and camera.
- Fit scale is `min(availableWidth / canvasWidth, availableHeight /
  canvasHeight)`, with the defined safe inset removed first.
- Manual zoom is clamped from 5% through 1600% actual size. The clamp belongs in
  the pure camera module and is applied consistently to wheel and button input.
- Anchored zoom preserves the logical coordinate under the pointer. Centered
  zoom buttons preserve the logical coordinate at viewport center.
- Camera helpers return new values and tolerate zero-sized/unmounted viewport
  measurements without producing non-finite values.

## Implementation sequence

### Phase 1: characterize the current boundary

- [x] Add browser characterization for the bounds of `.viewport-stage`,
  `.pixi-viewport`, and the renderer canvas at 1120x720, 1440x900, and
  1920x1080.
- [x] Add a non-square logical-canvas fixture so the implementation cannot rely
  on a square project or `aspect-ratio: 1`.
- [ ] Record coordinate and hit-test behavior at the center, each logical-canvas
  edge, and one pasteboard point before changing structure.
- [ ] Retain the existing gesture-precedence, export-size, containment, and mode
  switching coverage as regression tests.

### Phase 2: implement the pure camera model

- [x] Move the active viewport path to the explicit `ViewportCamera` contract
  and viewport/canvas measurement inputs. The dead `ViewportState`
  compatibility wrappers and aliases were removed from `src/app/viewport.ts`.
- [x] Add pure helpers for fitted scale, fit camera, actual-size camera, pan,
  pointer-anchored zoom, center-preserving resize, screen-to-logical conversion,
  logical-to-screen conversion, and rectangle conversion.
- [x] Add table-driven unit tests for square and non-square canvases, narrow and
  wide viewports, negative offsets, fit/manual resize, both zoom limits, and
  forward/inverse conversion round trips.
- [x] Make the controls expose distinct `Fit canvas` and `Actual size` actions.
  Keep zoom in/out and report the effective scale percentage.

### Phase 3: make the workspace the interaction surface

- [x] Make `ViewportCanvas` fill the available `.viewport-stage`; remove the
  640px cap and square aspect ratio from the interaction element.
- [x] Attach pointer, wheel, drag/drop, and coordinate handling to that full
  element.
- [ ] Add direct browser coverage for pointer-leave behavior on that full
  element.
- [x] Measure it with `ResizeObserver` and feed the measured rectangle to the
  camera helpers. Treat measurement as browser integration state, not domain
  state.
- [x] Position the transform toolbar and lower-corner controls as overlays so
  they do not reduce or silently alter camera dimensions.
- [ ] Render the logical-canvas boundary and origin through the same camera
  mapping as the Pixi scene. Remove duplicate transforms and implicit CSS scale.
- [ ] Add browser evidence for pointer capture while crossing the logical-canvas
  boundary or leaving the visible panel.

### Phase 4: separate editor rendering from export clipping

- [x] Extract shared, pure scene inputs from `fixed-canvas.ts`: evaluated image
  instances, world matrices, guide geometry, selection state, and visibility.
- [x] Add an editor renderer whose backing surface follows viewport device-pixel
  dimensions and whose world container uses the camera transform.
- [ ] Draw the logical-canvas transparency background, grid, boundary, and
  setup-origin marker at world coordinates. Do not mask scene entities to the
  logical rectangle.
- [ ] Keep the fixed-canvas renderer as the export/capture adapter. It continues
  to use exact logical dimensions and clips all output at those dimensions.
- [ ] Share asset decoding/resource ownership where it remains simple and
  deterministic; do not allow an editor resize or camera update to recreate
  image textures unnecessarily.
- [ ] Coalesce editor render requests and reject stale asynchronous results with
  the existing request-order guarantees.
- [x] Verify device-pixel-ratio resizing without changing logical coordinates or
  the meaning of the `100%` camera action.

### Phase 5: route editing through the unified camera

- [x] Use one screen-to-logical conversion path for selection, marquee,
  transforms, drops, and coordinate display.
- [ ] Add focused evidence for snapped pointer positions through the unified
  conversion path.
- [ ] Allow hit testing and transform handles for visible entities outside the
  logical canvas.
- [x] Let an empty primary drag begin a marquee on the pasteboard.
- [ ] Add browser evidence that Escape cancels a marquee before selection
  changes.
- [ ] Keep pan precedence for middle-drag and Space+primary-drag across both
  regions.
- [x] Ensure a camera action creates no command or undo entry.
- [ ] Add direct evidence that camera actions create no autosave write or
  dirty-project state.

### Phase 6: finish visual and accessibility behavior

- [ ] Use a solid pasteboard and a checkerboard only inside the logical canvas.
  Preserve a visible boundary at all supported zoom levels without scaling its
  stroke into illegibility.
- [ ] Keep canvas warnings near the viewport without shrinking the interaction
  surface unpredictably when warnings appear or disappear.
- [x] Give all controls stable accessible names and visible tooltips. Expose the
  current zoom as status text without announcing every wheel increment
  excessively.
- [ ] Maintain visible keyboard focus and ensure overlays do not intercept scene
  input outside their own controls.
- [x] Update stale companion documentation in `viewport-navigation-v1.md`,
  `fixed-canvas-rendering-v1.md`, and `setup-grid-v1.md`. `layout-qa-v1.md` and
  `first-release-evidence-v1.md` were reviewed and remain factually current.

## Acceptance criteria

### Navigation and layout

- [x] The interactive viewport bounds equal the usable center workspace bounds at
  every supported desktop size.
- Panning can start on the logical canvas or pasteboard and continues smoothly
  across their boundary.
- Wheel zoom can start on the logical canvas or pasteboard and keeps the logical
  point beneath the pointer stationary within rounding tolerance.
- [x] A non-square logical canvas is displayed without stretching.
- [x] `Fit canvas` shows the complete logical boundary with its safe inset;
  `Actual size` produces one CSS pixel per logical pixel.
- [x] Dock and timeline resizing never introduce document scrolling or move viewport
  controls outside the visible center panel.

### Editing

- Coordinate readout, selection, marquee, transform, snap, and drop resolve the
  same logical point under pan and zoom.
- An entity wholly outside the logical canvas remains visible, selectable, and
  transformable on the pasteboard.
- A pasteboard asset drop creates the attachment at the shown logical coordinate
  and produces the appropriate existing clipping/overflow warning.
- [x] Gesture precedence and Escape cancellation remain unchanged.

### Rendering and export

- Editor navigation never changes project state, pose evaluation, archive data,
  sampled frames, atlas metadata, or exported pixels.
- Editor rendering shows out-of-bounds content; PNG, grid, and packed exports
  remain clipped to the exact logical canvas.
- The renderer canvas used for export retains the exact logical width and height
  for square and non-square projects.
- Setup and Animate poses use the same editor camera and remain visibly correct
  during playback, resize, pan, and zoom.

### Regression and quality

- [x] Existing selection, transform constraints, Auto Key, visibility, grid,
  warnings, asset drop, and overlay behavior continues to pass.
- [x] Camera math is covered by unit tests; user-visible behavior is covered with
  Playwright assertions and screenshots at the supported viewport matrix.
- No implementation uses `any`, non-null assertions, mutable domain state, or
  project-schema compatibility shims.

## Expected files and boundaries

Likely changes:

- `src/app/viewport.ts`: pure camera and coordinate functions.
- `src/app/ViewportCanvas.tsx`: measurement, input routing, renderer lifecycle,
  and viewport overlays.
- `src/styles.css`: full-size interaction surface, pasteboard, logical boundary,
  and overlay placement.
- `src/rendering/fixed-canvas.ts`: extract shared scene construction while
  retaining fixed export behavior.
- A focused editor-renderer module under `src/rendering/` rather than adding a
  second rendering policy to React.
- `tests/unit/viewport.test.ts` and focused rendering tests.
- `tests/e2e/p2-viewport.spec.ts`, `tests/e2e/layout.spec.ts`, and
  `tests/e2e/smoke.spec.ts`.

Do not change domain model types, project schemas, archive versions, history
commands, or export metadata for this work.

## Commit checkpoints

1. Characterize full-workspace and non-square behavior.
2. Add the pure camera model and unit coverage.
3. Expand the interaction surface and migrate DOM overlays.
4. Separate editor rendering from fixed export rendering.
5. Enable pasteboard editing and complete browser coverage.
6. Update documentation and record final validation.

Each checkpoint should keep the project type-safe and independently reviewable.
Do not mark later checkboxes complete based only on state-level assertions;
viewport and animation claims require visible browser evidence.

## Validation gate

Run the focused unit and browser tests while developing, then complete the gate:

```sh
git diff --check
bun run check
bun run test:e2e
```

The checked scope has current test or browser evidence and the documentation
describes the new viewport/export separation accurately. The unchecked
acceptance criteria remain follow-up work or require direct rendered-pixel,
fixed-renderer, or archive/export verification before they can be claimed.

## Implementation notes / Validation evidence

The current implementation is split between the UI camera/input boundary and
two rendering adapters:

- `src/app/viewport.ts` exports the immutable `ViewportCamera` contract and
  `fitViewportCamera`, `actualSizeViewportCamera`, `panViewportCamera`,
  `zoomViewportCameraAtPointer`, `zoomViewportCameraAtCenter`,
  `resizeViewportCamera`, `screenToWorldPoint`, `worldToScreenPoint`,
  `worldBoundsToScreenRectangle`, and `screenRectangleToWorldBounds`. The pure
  module clamps manual scale to 5%–1600%, uses a 32 CSS pixel fit inset, and
  returns finite values for empty measurements.
- `src/app/ViewportCanvas.tsx` measures the full `.pixi-viewport` with
  `ResizeObserver`/window resize handling, routes pointer/wheel/drop input, and
  exposes Fit, Actual size, zoom, coordinate, marquee, and gesture state. The
  active camera is UI state and is preserved across Setup/Animate mode changes.
- `src/app/App.tsx` mounts the full-stage viewport and keeps canvas overflow
  warnings outside the project mutation path.
- `src/styles.css` makes `.viewport-stage` and `.pixi-viewport` fill the center
  workspace; the interaction surface has no 640px cap, square aspect-ratio
  constraint, or CSS camera transform.
- `src/rendering/editor-viewport.ts` exports
  `createEditorViewportRenderer`, `EditorViewportDimensions`,
  `EditorViewportCamera`, `resize`, `setCamera`, `setWorldTransform`,
  `renderSetup`, `renderPose`, and `destroy`. It owns a viewport-sized,
  device-pixel-aware Pixi surface.
- `src/rendering/render-scene.ts` exports `RenderScene`,
  `createSetupRenderScene`, `createPoseRenderScene`, and
  `renderSceneToContainer`; `src/rendering/image-resources.ts` exports
  `createImageResourceStore` for shared decoded-image/texture ownership.
- `src/rendering/renderer-types.ts` exports the typed `RendererResult`,
  `RendererError`, and `FixedCanvasRenderOptions` boundaries used by both
  adapters.
- `src/rendering/fixed-canvas.ts` retains `createFixedCanvasRenderer` with
  `renderSetup`, `renderPose`, `capturePng`, and `destroy` on an exact logical
  canvas surface. No direct current browser test proves its dimensions or
  captured clipping behavior, so those export claims remain unchecked above.
- Both Pixi adapters set `preserveDrawingBuffer: true` so explicit browser
  canvas readbacks used by screenshots and PNG assertions remain valid after a
  render. This fixed the editor readback regression without changing the
  logical camera or export contract.
- Camera unit coverage is in `tests/unit/viewport.test.ts`. Browser coverage is
  in `tests/e2e/p2-viewport.spec.ts`, `tests/e2e/p2-visibility.spec.ts`,
  `tests/e2e/layout.spec.ts`, and the viewport/rendering portions of
  `tests/e2e/smoke.spec.ts`; control naming and tooltip coverage is in
  `tests/e2e/p1-accessibility.spec.ts`.

Validation run in this worktree:

- `git diff --check` — passed.
- `bun run check` — passed: ESLint, 281 unit tests across 70 files, strict
  TypeScript typecheck, and production build.
- `bun run test:e2e -- tests/e2e/p2-viewport.spec.ts tests/e2e/layout.spec.ts tests/e2e/smoke.spec.ts` — passed: 39 tests.
- `bun run test:e2e` against a manually held occupied `bun run dev` server —
  passed: all 112 tests (112/112).

The remaining unchecked rendered-pixel, out-of-bounds-editor, fixed-export-
clipping, and archive/export invariance criteria require direct evidence beyond
the current browser assertions. No export/runtime behavior beyond the evidence
listed here is claimed by this closeout.
