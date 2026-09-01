import { describe, expect, test } from 'bun:test';
import {
	DEFAULT_LOCAL_TRANSFORM,
	degreesToRadians,
	invertAffine,
	identityMatrix,
	localTransformToMatrix,
	matrixToLocalTransform,
	multiplyAffine,
	radiansToDegrees,
	transformPoint,
	worldToLocalPoint
} from '../../src/domain/coordinates.ts';

describe('coordinate system', () => {
	test('applies local transforms in the documented order', () => {
		const matrix = localTransformToMatrix({
			...DEFAULT_LOCAL_TRANSFORM,
			x: 5,
			y: 7,
			scaleX: 2,
			scaleY: 3,
			shearX: Math.PI / 4
		});

		expect(transformPoint(matrix, { x: 1, y: 1 })).toEqual({ x: 10, y: 10 });
	});

	test('composes a child world matrix from its parent', () => {
		const parent = localTransformToMatrix({ ...DEFAULT_LOCAL_TRANSFORM, x: 10, y: 20 });
		const child = localTransformToMatrix({ ...DEFAULT_LOCAL_TRANSFORM, x: 5, y: 2 });
		const world = multiplyAffine(parent, child);

		expect(transformPoint(world, { x: 0, y: 0 })).toEqual({ x: 15, y: 22 });
	});

	test('round trips an invertible world point', () => {
		const world = localTransformToMatrix({
			x: 8,
			y: -4,
			rotation: 0.7,
			scaleX: 1.5,
			scaleY: 0.75,
			shearX: -0.2,
			shearY: 0.1
		});
		const localPoint = { x: 12, y: 3 };
		const worldPoint = transformPoint(world, localPoint);
		const recovered = worldToLocalPoint(world, worldPoint);

		expect(recovered?.x).toBeCloseTo(localPoint.x, 10);
		expect(recovered?.y).toBeCloseTo(localPoint.y, 10);
	});

	test('reports a non-invertible matrix instead of guessing', () => {
		const singular = localTransformToMatrix({ ...DEFAULT_LOCAL_TRANSFORM, scaleX: 0 });

		expect(invertAffine(singular)).toBeUndefined();
		expect(worldToLocalPoint(singular, { x: 1, y: 1 })).toBeUndefined();
	});

	test('decomposes an invertible matrix into an equivalent local transform', () => {
		const original = localTransformToMatrix({
			x: -3,
			y: 12,
			rotation: -0.8,
			scaleX: 1.4,
			scaleY: -0.6,
			shearX: 0.25,
			shearY: -0.15
		});
		const decomposed = matrixToLocalTransform(original);
		const recomposed = decomposed ? localTransformToMatrix(decomposed) : undefined;

		expect(recomposed?.a).toBeCloseTo(original.a, 10);
		expect(recomposed?.b).toBeCloseTo(original.b, 10);
		expect(recomposed?.c).toBeCloseTo(original.c, 10);
		expect(recomposed?.d).toBeCloseTo(original.d, 10);
		expect(recomposed?.tx).toBeCloseTo(original.tx, 10);
		expect(recomposed?.ty).toBeCloseTo(original.ty, 10);
	});

	test('does not mutate matrix inputs during multiplication', () => {
		const left = { ...identityMatrix(), tx: 4 };
		const right = { ...identityMatrix(), ty: 9 };
		const originalLeft = { ...left };
		const originalRight = { ...right };

		multiplyAffine(left, right);

		expect(left).toEqual(originalLeft);
		expect(right).toEqual(originalRight);
	});

	test('converts degrees and radians at the UI boundary', () => {
		expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 12);
		expect(radiansToDegrees(Math.PI / 2)).toBeCloseTo(90, 12);
	});
});
