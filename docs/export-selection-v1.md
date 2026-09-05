# Export selection v1

The Export panel is editor-session state. It does not modify the project
document or become part of `.rigatta` persistence.

The panel offers two output groupings:

- `combined`: selected clips share one export output and use unique frame keys.
- `per-clip`: each selected clip receives its own output grouping.

Opening the panel initially selects every project clip. Users can clear the
selection, select all clips, or toggle individual clips. Selection is
normalized against the current project before use, so deleted clips and stale
IDs cannot reach the export pipeline. The normalized order always follows the
project clip array rather than click order.

The panel currently establishes clip scope and grouping; frame rendering and
download actions are added by the later export tasks.
