# Project menu v1

The fixed editor header exposes project lifecycle actions through the `Project`
menu. Sprite-sheet `Export` remains a separate high-emphasis toolbar action.

## Actions

| Menu action | Behavior |
| --- | --- |
| `New project` | Creates an empty project with the fixed logical canvas. Authored content must be confirmed before replacement. |
| `Open recent` | Lists recent stable projects and recovery snapshots from the IndexedDB repository. A recovery snapshot is identified in the list and is loaded through the repository recovery path. |
| `Import .boneanim` | Reads a local archive and runs the complete archive validator before asking for replacement confirmation or changing the active project. Invalid input leaves the current project and image blobs untouched. |
| `Export project archive` | Packages the current project JSON and source image bytes with `exportProjectArchive`, then downloads a self-contained `.boneanim` archive. |
| `Load example` | Loads the bundled deterministic example and schedules it for recovery autosave. Authored content must be confirmed before replacement. |
| `Project settings` | Renames the project through the existing `rename-project` command and displays the fixed logical canvas as read-only information. It does not edit export settings or add UI state to the project schema. |

Opening a recent project, importing an archive, loading the example, and creating
a new project all preserve the replacement rule: an authored project requires
confirmation, while an empty project can be replaced directly. Loading and
archive import complete validation before replacement is considered. A failed
load or import reports an error without partially replacing the active state.

The archive action is intentionally named `Export project archive`; the
toolbar `Export` action opens sprite-sheet export controls. The two outputs have
different formats and purposes and must not be presented as interchangeable.
