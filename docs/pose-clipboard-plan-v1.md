# Pose clipboard implementation plan v1

## Status

Implementation is complete. The pure clipboard model and unit suite (`bun test
src tests/unit`), typecheck (`bun run typecheck`), and lint (`bun run lint`)
are green. The final gates passed: `git diff --check`, `bun run check` (306
unit tests), and `bun run test:e2e` (124 Chromium tests). This plan was written
against `master` at `ba8b249` on 2026-09-03.

## Objective

Add an application-local **Copy pose** / **Paste pose** workflow in Animate
mode. Copy captures the evaluated local transforms displayed at the current
playhead, including values produced by interpolation between keys. Paste creates
or updates transform keys at the destination playhead so the copied pose is
reproduced there.

This is distinct from the existing timeline key clipboard:

- timeline copy/paste copies selected keys, their relative frame offsets, and
  their interpolation metadata;
- pose copy/paste samples one evaluated pose and writes its transform values at
  one destination frame;
- timeline paste rejects collisions, while pose paste intentionally replaces
  transform values on keys already present at the destination frame.

The interaction follows the useful part of Spriter Pro's full-frame copy
workflow while retaining Rigatta's typed tracks and immutable command
history.

## Resolved version-1 scope

### Included

- Animate mode only.
- Every bone in the active rig.
- Every image, point, and rectangle attachment in the active rig.
- The evaluated parent-local transform properties `x`, `y`, `rotation`,
  `scaleX`, `scaleY`, `shearX`, and `shearY`.
- Copying from an exact key or an interpolated frame.
- Pasting into another frame or clip in the same project.
- Creating missing transform tracks and keys.
- Updating transform keys already present at the destination frame.
- One atomic and recoverable history transaction per paste.
- Toolbar actions, keyboard shortcuts, accessible status feedback, unit tests,
  and browser coverage.

### Excluded

- Setup mode.
- Cross-project paste and operating-system clipboard serialization.
- Selected-entities-only pose copy.
- Slot attachment selection, draw order, image opacity, point/rectangle enabled
  state, rectangle width/height, events, and interpolation curves.
- Setup transforms or other setup data.
- UI-only state such as selection, hidden entities, collapsed rows, pins,
  playhead position, or dock layout.
- Project schema, archive, autosave, export, and UI-preference changes.

The user-facing name must remain **pose**, not **frame**, until every keyable
part of frame state is intentionally covered.

## Interaction contract

### Copy pose

1. The action is enabled only in Animate mode when an active clip and evaluated
   pose are available.
2. Copy snapshots the current `EvaluatedPose` local transforms. It must not read
   setup transforms or only collect keys at the playhead.
3. Copying an interpolated frame stores exactly the values currently used by
   viewport rendering.
4. A later project or pose change does not mutate the snapshot.
5. Copy does not create history, autosave, project, selection, or pending-edit
   changes.
6. Success feedback reports the number of bones and attachments copied.

### Paste pose

1. The action is enabled only in Animate mode when an active clip and nonempty
   pose clipboard are available.
2. Paste targets the active clip at `activePlayback.frameIndex` and does not
   move the playhead.
3. Paste is allowed between clips only when the active project and every copied
   entity ID/kind remain compatible.
4. For every copied entity, paste writes all seven local transform properties.
   Keying all properties is required to reproduce the sampled pose independently
   of neighboring keys.
5. A missing track is created before its key. A missing destination key is
   created with `linear` interpolation and `curve: null`.
6. An existing destination key keeps its ID, time, outgoing interpolation, and
   Bezier curve. Only its numeric value changes. Pose paste therefore does not
   overwrite animation timing choices.
7. A value-identical existing key emits no command. If the entire paste is a
   no-op, report that no changes were needed and do not add a history entry.
8. All validation and ID planning completes before dispatch. Any incompatible
   entity, invalid value, unavailable clip/frame, or ID allocation failure
   rejects the whole paste without partial changes.
9. A successful paste is dispatched as one transaction. One Undo restores the
   complete prior pose-key state, including removing tracks created only by the
   paste.
10. Paste is explicit and independent of Auto Key. It does not change the Auto
    Key setting or consume unrelated pending edits.

### Commands and shortcuts

- Add **Copy pose** and **Paste pose** buttons to the Animate timeline toolbar
  near Auto Key and `Key edited properties`.
- Use `Ctrl/Cmd + Shift + C` for **Copy pose** and
  `Ctrl/Cmd + Shift + V` for **Paste pose**.
- Keep timeline-local `Ctrl/Cmd + C` and `Ctrl/Cmd + V` for selected timeline
  keys.
- Update the timeline key handler so it captures key clipboard shortcuts only
  when Shift and Alt are not held. Shifted shortcuts must reach the global pose
  actions.
- Ignore pose shortcuts while focus is in an input, textarea, select, or
  contenteditable element, matching the existing global shortcut rules.
- Buttons expose their shortcut in their tooltip, have stable accessible names,
  and use a polite live region for copy/paste success or validation failure.

## Data and pure planning model

Add `src/app/pose-clipboard.ts`. Keep clipboard construction, validation, and
paste planning pure and independent of React.

Use readonly data shaped along these lines; exact exported names may follow
existing project naming:

```ts
type PoseClipboardTransform = Readonly<{
	kind: 'bone' | 'attachment';
	targetId: EntityId;
	transform: LocalTransform;
}>;

type PoseClipboard = Readonly<{
	projectId: EntityId;
	sourceClipId: EntityId;
	sourceFrameIndex: number;
	transforms: readonly PoseClipboardTransform[];
}>;
```

The module should expose pure functions equivalent to:

- `createPoseClipboard(project, clip, frameIndex, pose)`;
- `planPastePoseClipboard(project, clip, frameIndex, clipboard, idFactory)`.

Both functions return a discriminated success/error result. Paste planning
returns readonly `ProjectCommand` values and summary counts; it never dispatches
commands itself.

Runtime validation must treat clipboard input as `unknown` at the paste
boundary. Do not use `any`, non-null assertions, mutable collection updates, or
type assertions to bypass validation. Prefer readonly arrays and `map`,
`flatMap`, `filter`, and `reduce` over loops.

### Paste planner details

- Validate finite transform values and an integer destination frame within clip
  bounds.
- Validate `projectId`, target IDs, target kinds, and exactly one entry for every
  currently expected bone and attachment. Reject stale, missing, or duplicate
  entries rather than partially applying a pose.
- Derive one typed `bone-transform` or `attachment-transform` definition per
  entity/property pair.
- Match tracks by definition, not by array position.
- Match existing keys using the repository's frame-index rounding convention.
- Allocate IDs only for missing tracks and keys. Verify every generated ID is a
  valid, unique ID that does not collide with any project entity.
- Plan IDs deterministically before producing commands so a failure cannot
  leave a partially constructed action.
- Preserve existing key interpolation/curve metadata when producing
  `set-number-key`; use the copied transform only as the new value.
- Avoid calling `autoKeyCommandsForProperty` directly unless it is first changed
  to support preserving existing interpolation. Its current update behavior
  resets existing keys to linear.

## Application integration

### `src/app/App.tsx`

- Hold `PoseClipboard | undefined` as session-only React state. Do not put it in
  the project, history state, UI preferences, or persistence.
- Construct the clipboard from `activePose`, the active clip, and the current
  frame.
- Plan paste against the latest project/clip/frame state rather than values
  captured by an old callback.
- Dispatch nonempty paste commands through `applyCommandSequence` once.
- Leave setup state, selection, inspector context, pending edits, playback, and
  the clipboard itself unchanged after paste.
- Route failures and success summaries to accessible user feedback.
- Wire global shortcut actions and Animate timeline props to the same copy/paste
  callbacks so keyboard and pointer behavior cannot diverge.

### `src/app/animate-timeline.tsx`

- Add the two toolbar actions and disabled-state inputs.
- Preserve the existing component-local typed key clipboard.
- Narrow unshifted key clipboard handling so the new shifted global shortcuts
  are not swallowed.
- Present pose clipboard notices separately enough that users can distinguish
  them from selected-key clipboard notices.

### `src/app/shortcuts.ts`

- Add typed global actions and shortcut-reference entries for pose copy/paste.
- Add exact modifier matching tests: shifted shortcuts invoke pose actions;
  unshifted shortcuts do not; Alt-modified variants do not.

## Implementation sequence

### P1 — Pure clipboard model

- [x] Add readonly pose clipboard types and discriminated result types.
- [x] Build a clipboard from the complete evaluated local pose.
- [x] Add runtime validation for project, clip, frame, entities, and finite
      transform values.
- [x] Plan missing tracks, new keys, and existing-key value updates.
- [x] Preserve existing interpolation and curves.
- [x] Suppress value-identical updates and expose no-op results.
- [x] Cover ID allocation and command ordering without mutation.

### P2 — Editor integration

- [x] Add session-only clipboard state and copy/paste callbacks in `App.tsx`.
- [x] Apply a successful paste through one `applyCommandSequence` call.
- [x] Add timeline toolbar buttons and accessible feedback.
- [x] Add global shifted shortcuts without changing unshifted key clipboard
      behavior.
- [x] Add shortcut reference entries and update tooltips.

### P3 — Verification and documentation

- [x] Add focused pure unit tests in `tests/unit/pose-clipboard.test.ts`.
- [x] Extend shortcut unit tests for exact modifier/scoping behavior.
- [x] Add Chromium coverage in `tests/e2e/pose-clipboard.spec.ts`.
- [x] Update `docs/keyboard-shortcuts-v1.md`.
- [x] Update `docs/animate-clips-v1.md` with the final behavior and exclusions.
- [x] Run the complete repository validation gate.

## Required unit evidence

Unit tests must prove:

1. Copy at an interpolated frame stores evaluated values rather than setup or
   neighboring-key values.
2. All bones and all attachment kinds contribute exactly seven local transform
   properties to the paste plan.
3. Pasting into an empty clip creates the required tracks and keys at the exact
   destination frame.
4. Pasting over existing keys changes values while preserving key IDs,
   interpolation modes, and Bezier curves.
5. Pasting where only some tracks/keys exist produces one valid combined plan
   without duplicate tracks or IDs.
6. A value-identical full paste produces no commands.
7. Cross-clip paste within the same project succeeds.
8. Project mismatch, stale/missing/duplicate entities, kind mismatch, nonfinite
   values, invalid frames, malformed unknown input, and colliding/generated IDs
   fail atomically.
9. Source objects are unchanged after clipboard construction and paste
   planning.
10. Shortcut parsing distinguishes shifted pose actions from unshifted timeline
    key actions and ignores unsupported modifiers.

## Required browser evidence

The browser test should exercise visible output as well as timeline state:

1. Open the built-in example in Animate mode and choose a frame whose pose is
   visibly interpolated.
2. Copy the pose using the toolbar and verify the accessible copied summary.
3. Seek to a different frame, paste, and verify transform key markers were
   created for the destination.
4. Verify the rendered canvas at the destination matches the copied frame. Use
   stable evaluated values or a pixel comparison rather than inferring success
   only from key markers.
5. Undo once and verify both the keys and visible pose return to their prior
   state; redo once and verify the pasted pose returns.
6. Repeat the core copy/paste path with `Ctrl/Cmd + Shift + C/V`.
7. Focus the timeline and confirm unshifted `Ctrl/Cmd + C/V` still operate on
   selected keys while shifted shortcuts operate on the pose.
8. Verify Paste pose is disabled before a pose is copied and both actions are
   unavailable outside Animate mode.

## Acceptance criteria

The feature is complete only when:

- a pose copied from an interpolated frame can be reproduced at another frame;
- every included local transform is keyed at the destination;
- existing destination curve/interpolation choices survive the paste;
- the paste is atomic and one Undo fully reverses it;
- key clipboard and pose clipboard shortcuts remain distinct;
- the clipboard remains session-only and cannot affect archives, autosave,
  exports, or project schema;
- visible browser evidence confirms the viewport pose, not only internal keys;
- affected documentation matches the implemented behavior;
- `git diff --check`, `bun run check`, and `bun run test:e2e` pass.

## Deliberately deferred follow-ups

These require separate product decisions rather than being folded into version
1:

- copy/paste only selected bones or attachments;
- include slot attachment state, draw order, opacity, enabled state, and
  rectangle dimensions;
- choose individual property categories before paste;
- paste mirrored poses or remap between structurally compatible rigs;
- serialize a validated pose payload to the operating-system clipboard;
- preserve or deliberately copy source interpolation metadata;
- provide a reusable pose library independent of animation frames.
