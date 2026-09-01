# Desktop layout QA v1

The first release supports desktop Chrome at these tested viewport sizes:

| Viewport | Checks |
| --- | --- |
| 1120 × 720 | Minimum CSS width/height, toolbar, canvas, and timeline remain visible. |
| 1440 × 900 | Standard desktop shell remains visible without horizontal overflow. |
| 1920 × 1080 | Wide desktop shell remains anchored with the logical canvas centered. |

`tests/e2e/layout.spec.ts` runs the matrix and asserts that Setup/Animate mode
controls, the Pixi canvas, and the animation timeline are visible and that the
document has no horizontal overflow. Mobile, touch, and narrower viewports are
outside the v1 support boundary.
