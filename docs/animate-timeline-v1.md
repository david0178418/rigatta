# Animate timeline v1

The Animate timeline uses `Auto` as its normal row mode. With no selected
timeline-capable entity, Auto shows the keyed entity and property rows. With a
selected bone or other timeline-capable entity, it shows that entity's rows and
any valid pinned rows. Asset-only selection and stale or malformed targets do
not create empty or invalid timeline rows. `All keyed` is the explicit override
for showing every keyed entity and property row. The row-mode preference is
project-scoped UI state; legacy `selection` values migrate to `auto`.

The matching-track count describes the effective visible rows. Auto empty
states distinguish an empty clip, selected entities without keyed properties,
and a clip with no keyed properties. Each state points to the relevant next
action: create a track, add a key, or switch to `All keyed`.

## Controls and detail routing

The compact control area has two rows. Clip tabs and clip creation are in the
first row. Step backward, play/pause, step forward, the frame readout, `Auto
Key`, and the pending-key action are in the second row. `Key edited properties
(N)` is rendered only when pending edits exist.

Track creation is under the labelled `Track details` popover. Pose copy and
paste are under `Pose clipboard`; row filtering, `Auto`/`All keyed`, and pin
clearing are under `Timeline options`; pan and zoom actions are under `Timeline
view`. These surfaces retain their keyboard shortcuts and isolate focused form
controls from timeline-local shortcuts.

Selecting a timeline key opens its typed key Properties context. Selecting an
event opens its typed event Properties context. The timeline does not reserve
permanently disabled `Key details` or `Event details` actions.

## Retained shortcuts

- `Space`: play or pause the active clip.
- `Left Arrow` and `Right Arrow`: step frames, or nudge selected keys while
  timeline keys are selected.
- `Ctrl/Cmd + C` and `Ctrl/Cmd + V`: copy and paste selected timeline keys.
- `Ctrl/Cmd + Shift + C` and `Ctrl/Cmd + Shift + V`: copy and paste the
  evaluated pose through the `Pose clipboard` actions.
- `Delete` or `Backspace`: delete selected timeline keys.
- `Escape`: cancel a key drag or marquee, then close an open compact surface,
  then clear selection when no surface or gesture is active.
- `K`: key pending property edits at the current frame.
- The focused timeline splitter retains `Arrow Up`, `Arrow Down`, `Home`, and
  `End` for accessible height changes.

## Layout proof

`tests/e2e/timeline-layout-proof.spec.ts` is the focused Chromium gate for the
default 260 px Animate timeline at 1120 × 720 and 1440 × 900. It covers no
selection, one selected bone, and the `All keyed` override. Each state asserts
viewport/document containment, the sticky ruler and row labels, the timeline's
independent scroll region, and at least three applicable data rows once the
timeline scroll region is exercised. The test writes full-viewport evidence to
these six paths during a run:

```text
/tmp/bone-animation-timeline-no-selection-1120x720.png
/tmp/bone-animation-timeline-selected-bone-1120x720.png
/tmp/bone-animation-timeline-all-keyed-1120x720.png
/tmp/bone-animation-timeline-no-selection-1440x900.png
/tmp/bone-animation-timeline-selected-bone-1440x900.png
/tmp/bone-animation-timeline-all-keyed-1440x900.png
```

The broader shortcut contract remains in
[Keyboard shortcuts v1](keyboard-shortcuts-v1.md).
