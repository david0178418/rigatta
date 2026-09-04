# Viewport navigation v1

The `.pixi-viewport` fills the usable `.viewport-stage` and is the single
pointer, wheel, drag/drop, and coordinate surface for the center workspace. The
fixed logical canvas is rendered as content in that surface; the surrounding
pasteboard remains visible and is not a DOM clipping boundary for editor
interaction.

Navigation uses the immutable camera contract from `src/app/viewport.ts`:

```ts
type ViewportCamera = Readonly<{
	scale: number;
	offsetX: number;
	offsetY: number;
	mode: 'fit' | 'manual';
}>;
```

`scale` is CSS pixels per logical pixel and the offsets are screen-pixel offsets
from centered logical-canvas placement. Fit uses the available viewport minus a
32 CSS pixel inset. Manual scale is clamped from 5% through 1600%. The initial
camera is fitted; manual navigation survives a resize by preserving the logical
point at the viewport center, while Fit refits to the new measurement.

- The mouse wheel zooms around the pointer. The `−`, `+`, and centered zoom
  actions use the same camera limits; `Fit canvas` and `Actual size` are
  separate actions, and `100%` means one CSS pixel per logical pixel.
- Primary dragging is reserved for the editor: click an entity to select it,
  drag an empty region for a marquee, or drag a selected entity/handle to
  transform it.
- Middle-button dragging and Space+primary dragging pan in screen pixels. The
  full pasteboard surface accepts these gestures as well as marquee starts and
  asset drops.
- Escape cancels the active pan, marquee, or transform gesture before release
  can change selection.
- The coordinate readout, selection, marquee, transform, and drop paths use the
  same screen-to-world mapping. Pasteboard coordinates can therefore be
  negative or outside the logical canvas and are passed to the existing canvas
  warning flow.
- The viewport controls are keyboard-focusable and expose accessible names and
  visible action tooltips. Setup and Animate mode changes preserve the mounted
  camera.

## Presentation presets

The compact `Presentation` control in the viewport toolbar exposes three
project-scoped UI presets:

- `Authoring` renders bones, gameplay guides, selection guides, transform
  handles, and the configured grid; transform gestures remain enabled.
- `Visual preview` renders the evaluated artwork without editor overlays and
  disables transform gestures.
- `Gameplay preview` renders artwork and gameplay guides without bones,
  selection guides, or transform handles; transform gestures remain disabled.

Changing a preset preserves selection, camera navigation, Fit/Actual size,
playhead scrubbing, playback, the rig tree, and inspector context. A preset
change cancels an active transform without committing a project command; pan,
zoom, and Fit remain available in both preview presets. Setup and Animate mode
switches retain the selected preset. Preferences are validated and stored per
project outside project history, authored pose data, archives, and exports;
malformed or stale storage falls back to `Authoring`.

Permanent Chromium evidence is in
[`tests/e2e/viewport-presets.spec.ts`](../tests/e2e/viewport-presets.spec.ts).
It captures the built-in example at a keyed Animate frame in all three presets
at 1120×720 and 1440×900, asserts no viewport renderer alert and non-background
scene pixels, compares Visual preview samples with the downloaded clean export
atlas frame, and checks the overlay and interaction contracts.

The current focused browser evidence covers full-stage bounds, pasteboard
marquee/pan/zoom, non-square Fit/Actual size, resize behavior, pasteboard drop,
camera history isolation, transform cancellation, and the supported desktop
layout matrix. The full `bun run test:e2e` suite passes all 112 tests against a
manually held occupied `bun run dev` server. The navigation state is UI-only;
fixed-renderer export and archive pixel invariance are not directly reverified
by this slice.

Move, Rotate, Scale, and Shear are available in a persistent toolbar at the
canvas edge. The toolbar remains available while the hierarchy/inspector dock
scrolls and while no entity is selected; its buttons expose the same `W`, `E`,
`R`, and `T` shortcuts documented in [Keyboard shortcuts](keyboard-shortcuts-v1.md).
Selecting a tool changes the active transform tool but does not add a
project-history entry or change viewport navigation state. The toolbar is a
vertical ARIA toolbar with directional focus movement and visible action/
shortcut tooltips.
