# Desktop layout QA v1

The first release supports desktop Chrome at these tested viewport sizes:

| Viewport | Checks |
| --- | --- |
| 1120 × 720 | Minimum supported desktop size; selected inspector, toolbar, canvas, and timeline remain contained. |
| 1280 × 800 | Standard laptop size; compact Setup row, resizable Animate timeline, and independent dock overflow remain usable. |
| 1440 × 900 | Standard desktop shell remains visible without horizontal or vertical document overflow. |
| 1920 × 1080 | Wide desktop shell remains anchored with the logical canvas centered and the timeline bounded. |

`tests/e2e/layout.spec.ts` runs the matrix after loading the bundled example and
selecting `arm`. It asserts that the document's scroll width and height do not
exceed the viewport in Setup or Animate mode, that the Move/Rotate/Scale/Shear
toolbar remains visible, and that Animate exposes playback, the ruler, and a
track row without document scrolling.

The same suite verifies the P0 exit workflow: Rotate and apply an inspector
transform, switch to Animate, scrub to frame 7, open and close Key details with
focus returned to its trigger, and start/stop playback. At 1280 × 800 it also
checks splitter keyboard and pointer resizing, the 190 px minimum, the 55%
maximum, and independent library, inspector, and dopesheet scroll containers.

The timeline height is intentionally UI-local and is not persisted. The asset
dock is configured for independent overflow even when the bundled example does
not contain enough assets to require scrolling. Mobile, touch, and narrower
viewports are outside the v1 support boundary.
