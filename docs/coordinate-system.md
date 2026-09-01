# Coordinate system and transforms

This document is the contract shared by the editor, pose evaluator, PixiJS
adapter, and exporter. It is part of the version 1 project format.

## Spaces and units

- All distances are logical canvas pixels. The project owns one fixed logical
  canvas with a positive integer width and height.
- The logical canvas origin is its top-left corner.
- Positive X points right and positive Y points down. This matches the browser
  canvas and PixiJS coordinate system.
- The root bone's parent transform is the identity transform. A root bone's
  local translation is therefore measured from the logical canvas origin.
- A slot has no transform of its own. Its attachments are evaluated in the
  coordinate space of the slot's bone.
- Draw order is an explicit ordered list of slots. It is not inferred from
  hierarchy depth or a matrix Z value.

## Angles

The domain stores rotation and shear angles in radians. Positive rotation is
clockwise on screen because Y points down. User-facing controls may display
degrees, but conversion happens at the UI boundary and never changes persisted
values.

The conversion rules are:

```text
degrees = radians × 180 / π
radians = degrees × π / 180
```

## Affine matrix representation

Affine matrices use the PixiJS-compatible six-number representation below and
operate on column vectors:

```text
| a  c  tx |   | x |   | a × x + c × y + tx |
| b  d  ty | × | y | = | b × x + d × y + ty |
| 0  0   1 |   | 1 |   |          1          |
```

The persisted transform fields are:

```text
{ x, y, rotation, scaleX, scaleY, shearX, shearY }
```

`x` and `y` translate the local origin. `scaleX` and `scaleY` are nonuniform
scale factors. `shearX` slants horizontally (`x += tan(shearX) × y`) and
`shearY` slants vertically (`y += tan(shearY) × x`).

For a local transform `L`, the matrix is composed in this exact order:

```text
L = T(x, y) × R(rotation) × Hx(shearX) × Hy(shearY) × S(scaleX, scaleY)
```

With column vectors, scale is applied first, then vertical shear, horizontal
shear, rotation, and translation. Matrix multiplication is associative but
not commutative; implementations must preserve this order.

## Hierarchy composition

If `parentWorld` is the world matrix of a parent bone and `local` is the
child's local matrix:

```text
childWorld = parentWorld × local
```

The world point of a local point `p` is `childWorld × p`. To convert a world
point back into a bone's local space, invert that bone's world matrix. A
non-invertible matrix is invalid for inverse editing operations and must return
a diagnostic rather than producing a guessed point.

## Image pivots

An image attachment stores a normalized fixed pivot `(pivotX, pivotY)` where
`(0, 0)` is the source image's top-left and `(1, 1)` is its bottom-right. The
attachment transform translates its local origin to the pivot location in the
slot bone's space. A source pixel `(u, v)` is evaluated as the local point:

```text
(u - pivotX × sourceWidth, v - pivotY × sourceHeight)
```

Changing the pivot changes the attachment's local geometry but does not change
the persisted source image dimensions.

## Numerical policy

- Persist finite IEEE-754 numbers only.
- Do not round during evaluation. Rounding is an export/serialization concern.
- Use an epsilon of `1e-10` when deciding whether an affine determinant is too
  close to zero to invert.
- Interpolation of angles uses the shortest signed angular delta in the range
  `[-π, π)`; exact opposite angles use the signed delta represented by the
  stored key values without introducing a random direction.
