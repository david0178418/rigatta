# Grid frame and animation output v1

Grid output writes one standard Pixi frame entry for every sampled frame. The
entry uses the deterministic grid placement, `rotated: false`, `trimmed:
false`, and matching complete `sourceSize` and `spriteSourceSize` values. The
atlas metadata reports the composed grid dimensions.

`createAnimationData` maps each selected clip name to its ordered frame keys.
Clip names and frame keys must be unique within the output so the generated
JSON cannot silently overwrite entries.
