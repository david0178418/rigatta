# PixiJS export and gameplay metadata version 1

The exporter emits standard PixiJS-compatible atlas JSON plus a companion
document for data that is not part of a texture atlas. The domain pose
evaluator supplies every sampled frame for both preview and export.

## Files

An export is either a directory-equivalent set of files or a ZIP download:

```text
atlas-0.png
atlas-0.json
animations.json
boneanim-metadata.json
```

Additional pages use `atlas-1.png`, `atlas-1.json`, and so on. Per-clip output
uses the clip-safe name as a directory/file prefix; the JSON structure stays
the same. `animations.json` maps clip names to frame keys, not to physical
coordinates.

## Standard PixiJS atlas JSON

Each page uses the TexturePacker-compatible PixiJS shape:

```json
{
  "frames": {
    "walk/frame-0000": {
      "frame": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "rotated": false,
      "trimmed": false,
      "spriteSourceSize": { "x": 0, "y": 0, "w": 128, "h": 128 },
      "sourceSize": { "w": 128, "h": 128 }
    }
  },
  "meta": {
    "app": "Bone Animation Utility",
    "version": "1",
    "image": "atlas-0.png",
    "format": "RGBA8888",
    "size": { "w": 128, "h": 128 },
    "scale": "1"
  }
}
```

Frame keys are unique, slash-separated, and deterministic. `rotated` is
always `false` in version 1. Atlas packing never rotates a trimmed rectangle.
For grid output, every frame cell is the complete logical canvas and
`trimmed` is false. For packed output:

- `sourceSize` is the complete logical canvas size.
- `spriteSourceSize` is the untrimmed frame's physical bounds in logical
  canvas coordinates.
- `frame` is the packed atlas rectangle.
- `trimmed` is true unless the physical bounds cover the complete canvas.

This preserves the original canvas origin when PixiJS reconstructs a sprite.

## Animation JSON

```json
{
  "animations": {
    "walk": ["walk/frame-0000", "walk/frame-0001"]
  }
}
```

The array order is sample order. Frame keys are unique across all selected
clips in combined output and are local to the export, not to the project.

## Companion metadata

`boneanim-metadata.json` has one sampled record per exported frame:

```json
{
  "schemaVersion": 1,
  "logicalCanvas": { "width": 128, "height": 128 },
  "clips": {
    "walk": {
      "fps": 12,
      "durationSeconds": 0.1666666667,
      "loop": true,
      "frames": [
        {
          "index": 0,
          "timeSeconds": 0,
          "frameKey": "walk/frame-0000",
          "atlasPage": 0,
          "events": [],
          "points": {},
          "rectangles": {}
        }
      ]
    }
  }
}
```

Point coordinates and rectangle corners are world-space logical-canvas
coordinates. Rectangle records also include evaluated width, height, rotation,
and enabled state. Events are attached to the sampled frame whose interval
contains the event time; exact frame-boundary behavior is deterministic and
uses the frame at that time. Structured event payloads contain only JSON
scalar, array, and object values validated by the project schema.

## Determinism

Sampling uses frame indexes rather than accumulated wall-clock time:
`timeSeconds = frameIndex / fps`. Packing sorts equal-priority rectangles by
frame key and uses a fixed MaxRects tie-break order. JSON keys and ZIP entries
are emitted in documented stable order so the same project and settings
produce byte-equivalent metadata.
