import { describe, expect, test } from 'bun:test';
import { extrudeRgbaFrame } from '../../src/export/extrude.ts';

describe('atlas edge extrusion', () => {
	test('duplicates border pixels into all padding edges and corners', () => {
		const result = extrudeRgbaFrame({
			width: 2,
			height: 2,
			pixels: Uint8Array.from([
				10, 0, 0, 255, 20, 0, 0, 255,
				30, 0, 0, 255, 40, 0, 0, 255
			])
		}, 1);

		if (!result.ok) {
			throw new Error(result.error);
		}

		expect(result.value).toMatchObject({ width: 4, height: 4 });
		expect([...result.value.pixels]).toEqual([
			10, 0, 0, 255, 10, 0, 0, 255, 20, 0, 0, 255, 20, 0, 0, 255,
			10, 0, 0, 255, 10, 0, 0, 255, 20, 0, 0, 255, 20, 0, 0, 255,
			30, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255, 40, 0, 0, 255,
			30, 0, 0, 255, 30, 0, 0, 255, 40, 0, 0, 255, 40, 0, 0, 255
		]);
	});

	test('rejects invalid frames and padding', () => {
		expect(extrudeRgbaFrame({ width: 1, height: 1, pixels: new Uint8Array(3) }, 1)).toMatchObject({ ok: false });
		expect(extrudeRgbaFrame({ width: 1, height: 1, pixels: new Uint8Array(4) }, -1)).toMatchObject({ ok: false });
	});
});
