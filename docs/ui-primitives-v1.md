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
  on hover or focus. Shortcut text is included in the same description.
- `Toolbar` exposes a labelled horizontal or vertical toolbar with directional
  and Home/End focus movement. `Tabs` uses the same roving-focus discipline for
  its horizontal tablist.

The focused browser suite in `tests/e2e/p1-ui-primitives.spec.ts` covers the
menu, dialog, popover, and tab call sites. Static primitive semantics are
covered in `tests/unit/ui-primitives.test.tsx`.
