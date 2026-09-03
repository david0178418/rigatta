# Accessible UI primitives v1

The editor's reusable UI primitives keep interaction state local to the
presentation layer and expose the corresponding WAI-ARIA state:

- `MenuButton` renders a labelled `menu` with enabled-item roving focus,
  Arrow/Home/End navigation, keyboard opening, Escape dismissal, outside-click
  dismissal, and trigger focus restoration.
- `Dialog` renders a modal surface labelled by its visible heading. It moves
  focus into the surface, traps Tab traversal, dismisses on Escape or an
  outside-overlay click, and restores the opener when it closes.
- `Popover` renders a labelled dialog surface tied to its trigger with
  `aria-controls`/`aria-expanded`, focuses its first control, dismisses on
  Escape or outside interaction, restores focus for keyboard dismissal, and
  clamps its measured surface inside the viewport.
- `Tooltip` exposes a `role="tooltip"` description to its child and shows it
  on hover or focus. Shortcut text is included in the same description. An
  optional placement class keeps the wrapper aligned when the compact control
  lives in a grid. The visible surface is viewport-positioned and clamped to
  the viewport, so dock and timeline overflow containers cannot clip it.
- `Toolbar` exposes a labelled horizontal or vertical toolbar with one roving
  tab stop, directional and Home/End focus movement, and form-control shortcut
  isolation. `Tabs` uses the same roving-focus discipline for its horizontal
  tablist.

Compact action controls use the tooltip primitive consistently: dock collapse,
image import, viewport zoom/center, Rig disclosure and visibility, Draw Order
rows and reorder controls, timeline navigation, timeline markers, and current
frame key diamonds all retain an accessible name and show the action on hover or
focus. The transform toolbar is a labelled `toolbar` with `aria-pressed` tool
state, while dock tabs use `aria-selected` and linked tabpanels. Menu and
popover triggers expose `aria-haspopup`, `aria-expanded`, and `aria-controls`
when open; Escape closes the active surface and restores focus to its trigger.
Export and shortcut-reference surfaces use the modal `Dialog` primitive with
focus entry, Tab containment, form-control Escape dismissal, and opener focus
return. Timeline Track details uses a labelled dialog trigger with
`aria-controls`/`aria-expanded`, automatic close-button focus, Escape dismissal,
and trigger focus return.

The focused browser suites in `tests/e2e/p1-ui-primitives.spec.ts` and
`tests/e2e/p1-accessibility.spec.ts` cover the menu, dialog, popover, tab,
toolbar, compact-action, and key-diamond call sites. Static primitive semantics
are covered in `tests/unit/ui-primitives.test.tsx`.
