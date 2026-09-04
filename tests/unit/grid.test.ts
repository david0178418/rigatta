import { describe, expect, test } from 'bun:test';
import { composeGridFrames, createGridLayout, createGridPageLayouts } from '../../src/export/grid.ts';
import { encodeRgbaPng } from '../../src/export/png.ts';
import type { RgbaFrame } from '../../src/export/trim.ts';

const frame = function frame(fill: number): RgbaFrame {
	return {
		width: 2,
		height: 1,
		pixels: Uint8Array.from([fill, 0, 0, 255, fill, 0, 0, 255])
	};
};

describe('grid export layout', () => {
	test('places complete frame cells in deterministic rows and columns', () => {
		const result = createGridLayout(2, 1, 5, 4);

		if (!result.ok) {
			throw new Error(result.error);
		}

		expect(result.value).toMatchObject({ width: 4, height: 3, columns: 2, rows: 3 });
		expect(result.value.placements).toEqual([
			{ index: 0, x: 0, y: 0, width: 2, height: 1 },
			{ index: 1, x: 2, y: 0, width: 2, height: 1 },
			{ index: 2, x: 0, y: 1, width: 2, height: 1 },
			{ index: 3, x: 2, y: 1, width: 2, height: 1 },
			{ index: 4, x: 0, y: 2, width: 2, height: 1 }
		]);
	});

	test('composes full-size RGBA cells without changing source frames', () => {
		const layout = createGridLayout(2, 1, 2, 4);

		if (!layout.ok) {
			throw new Error(layout.error);
		}

		const first = frame(10);
		const second = frame(20);
		const result = composeGridFrames([first, second], layout.value);

		if (!result.ok) {
			throw new Error(result.error);
		}

		expect([...result.value.pixels]).toEqual([
			10, 0, 0, 255, 10, 0, 0, 255,
			20, 0, 0, 255, 20, 0, 0, 255
		]);
		expect([...first.pixels]).toEqual([10, 0, 0, 255, 10, 0, 0, 255]);
	});

	test('splits complete cells into deterministic pages when a sheet is full', () => {
		const result = createGridPageLayouts(2, 2, 5, 4);

		if (!result.ok) {
			throw new Error(result.error);
		}

		expect(result.value.map((page) => ({ index: page.index, offset: page.offset, count: page.layout.placements.length }))).toEqual([
			{ index: 0, offset: 0, count: 4 },
			{ index: 1, offset: 4, count: 1 }
		]);
		expect(result.value[1]?.layout).toMatchObject({ width: 2, height: 2, columns: 2, rows: 1 });
	});

	test('encodes deterministic RGBA PNG bytes', () => {
		const first = encodeRgbaPng(frame(10));
		const second = encodeRgbaPng(frame(10));

		if (!first.ok || !second.ok) {
			throw new Error('The valid RGBA fixture should encode.');
		}

		expect(first.value).toEqual(second.value);
		expect([...first.value.slice(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
		expect(new DataView(first.value.buffer).getUint32(16)).toBe(2);
		expect(new DataView(first.value.buffer).getUint32(20)).toBe(1);
	});
});
