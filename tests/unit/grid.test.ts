import { describe, expect, test } from 'bun:test';
import { snapPointToGrid } from '../../src/app/grid.ts';

describe('setup grid settings', () => {
	test('snaps logical points to the nearest spacing', () => {
		expect(snapPointToGrid({ x: 47, y: 81 }, 32)).toEqual({ x: 32, y: 96 });
	});

	test('leaves points unchanged for invalid spacing', () => {
		const point = { x: 47, y: 81 };

		expect(snapPointToGrid(point, 0)).toBe(point);
		expect(snapPointToGrid(point, Number.NaN)).toBe(point);
	});
});
