import { describe, expect, test } from 'bun:test';
import { packMaxRects } from '../../src/export/packing.ts';

const rectangles = [
	{ key: 'frame-c', width: 1, height: 3 },
	{ key: 'frame-a', width: 2, height: 2 },
	{ key: 'frame-b', width: 3, height: 1 }
] as const;

describe('deterministic MaxRects packing', () => {
	test('sorts keys and keeps padded placements inside the atlas', () => {
		const result = packMaxRects(rectangles, { width: 8, height: 8 }, 1);

		if (!result.ok) {
			throw new Error(result.error);
		}

		expect(result.value.placements.map((placement) => placement.key)).toEqual(['frame-a', 'frame-b', 'frame-c']);
		result.value.placements.forEach((placement) => {
			expect(placement.x).toBeGreaterThanOrEqual(1);
			expect(placement.y).toBeGreaterThanOrEqual(1);
			expect(placement.x + placement.width).toBeLessThanOrEqual(7);
			expect(placement.y + placement.height).toBeLessThanOrEqual(7);
		});

		result.value.placements.forEach((left, leftIndex) => result.value.placements.slice(leftIndex + 1).forEach((right) => {
			expect(left.x + left.width <= right.x
				|| right.x + right.width <= left.x
				|| left.y + left.height <= right.y
				|| right.y + right.height <= left.y).toBe(true);
		}));
	});

	test('is independent of input order and rejects unfit rectangles', () => {
		const first = packMaxRects(rectangles, { width: 8, height: 8 }, 1);
		const second = packMaxRects([...rectangles].reverse(), { width: 8, height: 8 }, 1);
		const tooLarge = packMaxRects([{ key: 'large', width: 7, height: 7 }], { width: 8, height: 8 }, 1);

		expect(first).toEqual(second);
		expect(tooLarge).toMatchObject({ ok: false });
	});
});
