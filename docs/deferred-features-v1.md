# Deferred-feature audit v1

The deferred-feature list in `DesignDoc.md` was checked against the source,
tests, and release workflows on 2026-09-01. None of these features is needed
by a supported first-release workflow, and none has become a release blocker.

| Deferred feature | Release status |
| --- | --- |
| Mesh deformation, vertex weights, and multi-bone binding | Not required; the model and evaluator remain rigid forward-kinematic. |
| Inverse kinematics and other constraints | Not required; authored transforms are evaluated directly. |
| Multiple rigs in one project | Not required; the project schema and editor enforce one root rig. |
| Skins, character maps, and batch variant export | Not required; export consumes the selected project clips and attachments. |
| Onion skinning | Not required; the editor previews the active setup or pose only. |
| Audio import and synchronized playback | Not required; clips contain animation and gameplay metadata only. |
| Automatically sized logical frame bounds | Not required; the project uses a fixed logical canvas and reports overflow. |
| Skeletal runtime exports and runtime libraries | Not required; the first release exports sampled sprite sheets and metadata. |
| Engine-specific exporters other than PixiJS | Not required; PixiJS is the sole first-release target. |
| Firefox, Safari, touch, and mobile support | Not required; the supported environment is desktop Chrome with mouse and keyboard input. |

The release evidence remains bounded to the documented scope: one rigid rig,
local persistence, sampled clip export, PixiJS atlas output, and the desktop
Chrome workflows recorded in [`first-release-evidence-v1.md`](first-release-evidence-v1.md).
