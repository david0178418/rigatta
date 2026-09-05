# UX usability pass v1

## Purpose

This document proposes a usability pass for the current editor. The goal is to
make it feel familiar to users of desktop 2D animation tools such as Spine and
Spriter without copying features that are outside this application's scope.

The proposal keeps the first-release contract intact: one rigid forward-
kinematic rig, Setup and Animate modes, separate bones/slots/attachments, a
fixed logical canvas, gameplay attachments, local persistence, and sampled
sprite-sheet export. It does not introduce IK, constraints, mesh deformation,
skins, audio, onion skinning, multiple rigs, or a skeletal runtime.

## Evaluation basis

The review covered the current implementation in desktop Chrome at 1280 x 800,
using both an empty project and the bundled Cutout Robot example in Setup and
Animate modes. It also considered the product and interaction documents in this
repository.

The following established patterns are useful references:

- Spine treats the tree as a central hierarchical navigator, provides inline
  visibility and key controls, and shows properties for the selected tree item.
  See the [Spine tree view guide](https://en.esotericsoftware.com/spine-tree).
- Spine's dopesheet groups keyed properties by object, connects selection across
  the tree/viewport/dopesheet, supports direct seeking and box selection, and
  distinguishes timing editing from value-curve editing. See the
  [Spine dopesheet guide](https://en.esotericsoftware.com/spine-dopesheet).
- Spine exposes direct transform and keying shortcuts for high-frequency work.
  See the [Spine shortcut reference](https://en.esotericsoftware.com/spine-cheat-sheet).
- Spriter uses a central canvas with surrounding palettes and a bottom timeline;
  its timeline can be expanded vertically to reveal per-object rows, and it
  exposes draw order as a direct editing surface. See the
  [Spriter Pro manual](https://brashmonkey.com/spriter_manual/Spriter_Manual.pdf),
  especially pages 6 and 12.

These are interaction references, not a requirement to reproduce either
application's visual styling or entire feature set.

## Implementation checkpoint — 2026-09-02

The current editor implements and verifies a focused slice of this proposal:

- Entity names and numeric properties commit on Enter/blur with inline draft
  validation; duplicate entity `Rename` and `Apply values` actions are gone.
- The Assets surface explains the pending canvas/slot drop result and reports
  imported, skipped, and conflicting files in a bounded accessible summary.
- The canvas keeps transform tools beside the viewport, adds a setup-origin
  marker and live logical-coordinate readout, and exposes grid settings through
  a labelled dismissible popover.

The full P1/P2 plan remains the acceptance source of truth. Unchecked tasks in
[the task plan](./ux-p1-p2-tasks-v1.md) are not release claims from this
checkpoint.

## Summary of the current experience

### What should be retained

- The Setup/Animate mode switch is prominent and maps cleanly to the domain.
- The three-column workspace plus bottom timeline is a sensible desktop-editor
  foundation.
- The dark, restrained palette keeps attention on artwork and selection handles.
- Asset folder preservation and drag-to-canvas creation are understandable.
- Selection is shared between the hierarchy and viewport.
- Auto Key, keyed/pending/unkeyed states, fixed-canvas readout, grid controls,
  validation diagnostics, undo/redo, and export preflight are valuable domain-
  specific affordances.
- The bundled example is useful for learning and regression checks.

### Main usability problems

1. **The shell does not remain a contained desktop workspace.** At 1280 x 800,
   selecting the example's `arm` bone makes the inspector extend below the
   viewport. In Animate mode, the document becomes about 1731 px tall; the
   nominal 190 px timeline begins around y=934 and its content is about 797 px
   tall. The user must scroll the whole web page away from the canvas to reach
   animation controls. This is the highest-priority issue.
2. **High-frequency tools are placed in a low-frequency location.** Move,
   Rotate, Scale, and Shear live below all numeric inspector fields and can be
   offscreen. A transform tool should be reachable next to the canvas regardless
   of selection details.
3. **The timeline is a stack of forms rather than a direct-manipulation editor.**
   Clip management, playback, navigation, track creation, event creation, key
   creation, key editing, interpolation, scrubbing, and clip settings are placed
   one after another. The dopesheet is pushed far below the controls it exists to
   support.
4. **The hierarchy communicates structure weakly.** Bones, slots, images, points,
   and rectangles use small text glyphs and fixed indentation, with no expand/
   collapse control, visibility control, or obvious separation between rig
   hierarchy and draw order.
5. **Inspector editing requires unnecessary confirmation.** Rename and transform
   values each require a separate action button. This slows iterative posing and
   makes it unclear whether a changed field is merely drafted or committed.
6. **Key state is verbose but not actionable.** Repeated `UNKEYED`, `KEYED`, and
   `PENDING` labels consume scarce inspector width. The state should be compact,
   consistent, and clickable for keying where applicable.
7. **Canvas navigation competes with editing.** Left-drag is expected for object
   selection, marquee selection, and transform manipulation. Using the same
   primary gesture for panning makes the canvas harder to predict.
8. **Project-level actions lack familiar organization.** `Load example` is a
   permanent primary-toolbar item, while project archive import/export,
   autosave/recovery status, and sprite-sheet export are not presented as a
   coherent project workflow.
9. **Important actions rely on ambiguous symbols.** Several `+`, `?`, arrow, dot,
   and shape controls require trial and error. Some are accessible by name but
   do not explain themselves visually until invoked.

## Proposed workspace model

The application should behave as a fixed-height editor with independently
scrollable and resizable docks.

```text
+--------------------------------------------------------------------------+
| Project / save state | Setup  Animate | Undo Redo Help | Export          |
+----------------------+--------------------------------+------------------+
| Rig / Draw Order     | Transform tools + Canvas       | Properties       |
|                      |                                | Assets           |
| independent scroll   | viewport never page-scrolls    | independent scroll|
+----------------------+--------------------------------+------------------+
| clip | playback | frame | Auto Key | filter / timeline options           |
| object/property rows             | ruler, playhead, keys, event row       |
+--------------------------------------------------------------------------+
```

Recommended behavior:

- Constrain the shell to the viewport (`100dvh`) and prevent document-level
  scrolling during normal editing.
- Give the left dock, right dock, and timeline their own scroll containers.
- Add draggable splitters between left/canvas/right and above the timeline.
- Remember dock widths, timeline height, collapsed sections, and active tabs in
  local UI preferences rather than project data.
- Use practical starting sizes: left 260 px, right 300 px, and timeline 260 px in
  Animate mode. Allow the timeline to resize from a compact transport-only bar
  to roughly 55% of the window height.
- In Setup mode, collapse the timeline to a slim animation status/clip bar or
  hide it entirely. Setup work should receive the canvas space.
- At the supported minimum size, preserve the canvas and main toolbar first;
  collapse labels or secondary actions into menus before allowing overflow.

## Proposed changes by area

### 1. Application chrome and project workflow

- Keep the project name at the upper left, but add a compact persistence state:
  `Saving...`, `Saved locally`, or `Save failed`.
- Replace the permanent `Load example` button with a **Project** menu containing
  New, Open recent, Import `.rigatta`, Export project archive, Load example,
  and project settings. This consolidates recovery and portability actions.
- Keep sprite-sheet **Export** as the distinct high-emphasis action at the upper
  right. Label archive export differently so the two outputs cannot be confused.
- Keep Undo and Redo visible, using familiar icons plus tooltips and shortcut
  labels. Disabled state must remain clear.
- Add tooltips to every icon-only control. Tooltips should include the action and
  shortcut, for example `Rotate (E)`.
- Show validation failures near the affected control or dock. Keep the global
  diagnostics summary available, but do not make the timeline the only place
  errors can appear.

### 2. Rig, slots, attachments, and draw order

- Make the left dock the primary structural navigator. Its top-level tabs should
  be **Rig** and **Draw Order**. This follows the familiar outliner/tree model and
  gives draw order a first-class surface without conflating it with parenting.
- Render a real expandable tree with disclosure arrows and distinct, consistent
  icons for bone, slot, image, point, and rectangle. Indentation should reflect
  actual parent depth, not merely entity type.
- Keep slots and their image attachments under the owning bone. Do not imply that
  point and rectangle attachments are slots.
- Add row hover, selected, multi-selected, hidden, active-attachment, and drag-
  target states that remain legible without relying only on color.
- Add a visibility toggle for items that can be hidden in the authoring viewport.
  If visibility is not project data, make it explicitly editor-only and never
  export it as animation state.
- Preserve drag-to-reparent for bones and drag-to-reorder for draw order, with a
  clear insertion line and parent highlight. Do not allow a slot drag in the Rig
  tab to silently change draw order.
- Support inline rename by double-click or `F2`, and deletion with `Delete` plus
  the existing destructive confirmation rules.
- Replace the single ambiguous `+` with a menu whose contents depend on the
  selection: child bone, slot, image attachment, point, or rectangle. Disabled
  options should explain the required selection.
- Add a small search/filter field when project size warrants it. Search results
  should preserve type and ancestry context.
- Selecting an item in the viewport should reveal and select it in the tree.
  Selecting a timeline row should select the same object in the tree and canvas.

The Draw Order tab should show slots in back-to-front order, label the direction,
and support direct drag reordering. In Animate mode it should display whether the
current order comes from setup or a keyed override and offer a direct key button.

### 3. Assets

- Place **Assets** in a right-dock tab next to Properties, or allow it to be
  docked on either side. The important convention is that the Rig tree owns
  structure and the asset browser owns source images.
- Keep folder hierarchy, search, directory import, and drag-to-canvas behavior.
- Add thumbnail/list density choices; thumbnails make visually similar part
  names easier to distinguish.
- Show an image preview and basic metadata on hover or selection: dimensions,
  format, relative path, and whether it is used in the rig.
- Make the drop result explicit before commit: dropping on the canvas creates a
  slot and attachment under the selected bone; dropping on a slot adds an
  attachment to that slot. If there is no valid target, highlight the required
  parent rather than guessing.
- After import, show a brief nonmodal summary with image count, skipped files,
  and duplicate/conflict handling.

### 4. Canvas and tools

- Move transform tools into a persistent vertical toolbar on the left edge of
  the canvas. Use Move, Rotate, Scale, and Shear icons with text tooltips.
- Use the general DCC `W`, `E`, `R`, `T` mapping for Move, Rotate, Scale, and
  Shear. Document the mapping and show it in tooltips; do not support competing
  hidden mappings such as `V`, `C`, `X`, or unmodified `Z`.
- Reserve primary click/drag for select, marquee, and active-tool manipulation.
  Pan with middle-drag or Space+primary-drag; wheel zoom should remain pointer-
  anchored. A right-drag option may be added if browser context-menu behavior is
  handled consistently.
- Put zoom percentage, zoom in/out, frame/center, and canvas coordinate readout
  in a compact lower-corner overlay. Move grid visibility, spacing, and snap into
  a grid popover in the canvas toolbar.
- Provide a visible setup-origin marker and clearer bone/attachment selection
  outlines. Handles should scale visually with zoom and advertise the active
  axis or operation before dragging.
- Use Shift for axis/angle/aspect constraints where applicable and show the
  constraint in the status line during a gesture.
- Double-clicking empty canvas or pressing Escape should clear selection.
- Keep the fixed logical canvas boundary visually distinct from the surrounding
  pasteboard. Navigation must continue to leave export coordinates unchanged.

### 5. Properties inspector

- Keep the right dock focused on the current selection. Split it into collapsible
  groups such as Identity, Transform, Image, Slot, Gameplay, and Animation.
- Put Rename, Duplicate where meaningful, and Delete in a compact header action
  area. Rename should normally commit on Enter or blur; Escape cancels.
- Replace `Apply values` with immediate field commits on Enter/blur. Continuous
  label-scrubbing or arrow-key nudging should form one undo transaction per
  gesture. Invalid drafts remain in the field with an inline error and do not
  mutate project state.
- Use compact paired rows for X/Y, Scale X/Y, Shear X/Y, Pivot X/Y, and Width/
  Height. Include units in the field or suffix (`px`, `deg`, `%`) rather than in
  long labels.
- Add reset-to-setup/default controls only where they have an unambiguous domain
  meaning.
- In Animate mode, show one small key-state control beside every animatable
  property:
  - hollow diamond: no key at the current frame;
  - filled accent diamond: keyed at the current frame;
  - amber dot/diamond: edited but pending because Auto Key is off.
- Make the diamond clickable to add or remove the current-frame key. Provide a
  tooltip and accessible text so state is not communicated by color alone.
- Keep Auto Key visible in the animation transport. When it is off and pending
  edits exist, show a compact persistent `Key 3 edited properties` action rather
  than repeating large state labels.
- For multi-selection, show shared values and a mixed-value state. Only expose
  operations that the complete selection supports.

### 6. Animation timeline and dopesheet

The timeline should prioritize manipulating time. Configuration forms should
move into the Properties dock, popovers, or small dialogs.

Use a compact, sticky toolbar with this order:

1. animation/clip selector and add menu;
2. jump to start, previous frame/key, play/pause, next frame/key, jump to end;
3. editable current frame and read-only time;
4. loop and Auto Key;
5. filter, zoom, and timeline options.

Below the toolbar:

- Show an overview row first, then entity rows with collapsible property rows.
  Group existing tracks under their owning bone, slot, or attachment instead of
  presenting one flat track label per property.
- Default to showing tracks for the current selection. Provide a pin/lock control
  for keeping the current row set visible while selecting other objects, plus an
  `All keyed` filter. This keeps small tasks focused without losing whole-clip
  access.
- Always keep Draw Order and Events in recognizable dedicated rows at the bottom
  when relevant.
- Clicking the ruler or empty key lane seeks. Dragging the playhead scrubs.
  Clicking a key both selects it and moves the playhead to it.
- Drag keys horizontally to retime them with frame snapping. Support modifier-
  based additive selection, marquee selection, Delete, copy/paste, and arrow-key
  nudging. Keep numeric frame entry in the inspector for precision.
- Use key shapes/colors and connecting line styles to distinguish transform,
  attachment, draw-order, enabled, and event data, with a legend or tooltips.
  Stepped/linear/Bezier must not rely on color alone.
- Keep value and interpolation editing in a contextual key inspector. Open the
  Bezier editor only for a selected continuous key; do not permanently consume
  timeline height.
- Create tracks automatically when the user keys a valid property. Keep explicit
  `Add track` in an advanced menu for attachment swaps, draw order, enabled
  states, and other nonnumeric tracks. The current long `New track` select should
  not sit above the dopesheet.
- Add and edit events directly from the Events row. Selecting an event opens its
  name, frame, and JSON payload in the right inspector with inline validation.
- Move clip name, duration, FPS, and loop settings into a Clip section in the
  Properties dock. Clip duplication and deletion belong in the clip selector's
  menu, with confirmation for deletion.
- Make timeline vertical and horizontal scrolling independent from the page.
  Keep the row labels and ruler sticky while scrolling.

### 7. Setup and Animate workflows

**Setup mode** should emphasize assembly:

1. Create/open a project or load the example.
2. Import an image folder.
3. Select the root/parent bone in the Rig tree.
4. Drag images onto the canvas or a slot.
5. Adjust pivot, transforms, hierarchy, and setup draw order.
6. Create points/rectangles and set the fixed canvas/grid.
7. Switch to Animate.

Show the next valid action in empty states, but remove instructional copy once
the relevant content exists. Setup mode should never imply that an edit creates
animation keys.

**Animate mode** should emphasize posing and timing:

1. Select or create a clip from the timeline toolbar.
2. Set FPS/duration before substantial keying.
3. Select an object in the tree or canvas.
4. Pose it with a canvas tool or inspector field.
5. Confirm the key diamond/Auto Key result immediately.
6. Retime keys directly in the visible dopesheet.
7. Add attachment, draw-order, enabled-state, or event keys from their dedicated
   rows/actions.
8. Play, scrub, validate, and export.

Switching modes should preserve selection and viewport navigation. Switching
clips should preserve selection when the entity exists and reset the playhead in
a predictable, documented way.

## Keyboard and accessibility baseline

Retain the existing undo/redo, playback, frame-step, and shortcut-reference
bindings, then add a small coherent set for the proposed direct workflows:

- transform tool selection;
- Escape to cancel the active gesture or clear selection;
- F2 to rename;
- Delete to delete the current selection/selected keys;
- Ctrl/Cmd+C and Ctrl/Cmd+V for timeline keys where focus is in the timeline;
- K to key edited properties or the active property, with the exact behavior
  stated in the shortcut reference.

Shortcuts must remain inactive in text-editing controls. Every shortcut action
must also be reachable with the mouse. Preserve visible focus, semantic names,
keyboard traversal, and non-color state cues. Use tooltips for compact controls,
but do not make a tooltip the only source of an essential label.

## Priority and delivery plan

### P0: restore the desktop-editor shell

- Fix viewport containment and eliminate normal document-level scrolling.
- Add independent scroll containers for both side docks and the timeline.
- Make the Animate timeline visible immediately and resizable.
- Move transform tools next to the canvas.
- Move clip/key/event configuration below the fold out of the dopesheet surface.

Exit criterion: at 1120 x 720, 1280 x 800, 1440 x 900, and 1920 x 1080, a
user can select any example entity, switch modes, edit a transform, scrub keys,
and press playback without scrolling the document.

### P1: make structure and keying direct

- Introduce the expandable Rig tree and separate Draw Order view.
- Convert inspector values to commit-on-blur/Enter with compact key diamonds.
- Group dopesheet rows by entity and synchronize tree/canvas/timeline selection.
- Add direct seeking, key dragging, marquee selection, and standard key commands.
- Add persistence state, contextual menus, and tooltips.

Exit criterion: a user can assemble a simple two-bone cutout and create/retime a
two-pose clip without using an `Apply values`, `Add track`, or `Move key` form.

### P2: improve efficiency and customization

- Add dock splitters, remembered layout, density/thumbnail options, and pinned
  timeline rows.
- Add inline rename, visibility toggles, selection history/reveal behavior, and
  expanded shortcuts.
- Refine event, draw-order, attachment-swap, and gameplay-attachment editing in
  the shared inspector.

Exit criterion: repeated posing and timing work can be completed primarily in
the canvas, tree, inspector fields, and dopesheet, with configuration surfaces
appearing only when requested.

## Usability validation

Automated layout tests should assert more than visibility. For each supported
viewport and both modes, verify:

- `document.documentElement.scrollHeight` does not exceed the viewport height
  during normal editing;
- the canvas, selected-object properties, timeline toolbar, ruler, and at least
  one track row are simultaneously reachable;
- side docks and timeline scroll independently;
- resizing a dock cannot push the canvas or primary toolbar offscreen;
- focus order remains logical after opening menus, dialogs, and dock tabs;
- selection and key-state cues have text/shape equivalents to color.

Add task-based manual checks with the bundled example:

1. Find and rotate `arm`, key it at frames 1 and 7, and play the clip.
2. Change the setup draw order, then key a different draw order in Animate mode.
3. Add and retime an event, edit its payload, and find the corresponding marker.
4. Import an image, create an attachment in the intended slot, and adjust pivot.
5. Recover from an invalid numeric value and an invalid event payload without
   losing the previous valid project state.
6. Complete the same tasks at 1120 x 720 without page scrolling.

Success should be judged by task completion, misclicks, unexpected mode/key
changes, and time spent navigating between canvas, inspector, and timeline—not
by visual resemblance to Spine or Spriter alone.

## Explicit non-goals

This pass must not use familiarity as a reason to add Spine/Spriter features
that the product deliberately defers. In particular, do not add IK, constraints,
weighted meshes, skins/character maps, audio, onion skinning, multiple rigs,
runtime skeletal export, or automatically sized logical bounds. UI placeholders
for unavailable features should also be avoided; they create false expectations
and consume the limited workspace.
