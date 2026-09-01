import { describe, expect, test } from 'bun:test';
import { createPixiAtlasData } from '../../src/export/atlas.ts';
import { trimRgbaFrame } from '../../src/export/trim.ts';

const frame = {
	width: 4,
	height: 3,
	pixels: Uint8Array.from([
		0, 0, 0, 0, 10, 20, 30, 255, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 40, 50, 60, 128, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
	])
};

describe('Pixi atlas metadata', () => {
	test('maps a trimmed frame to standard source and packed rectangles', () => {
		const trimmed = trimRgbaFrame(frame);

		expect(trimmed.ok).toBe(true);
		if (!trimmed.ok) {
			return;
		}

		const atlas = createPixiAtlasData('test/frame', trimmed.value, { x: 3, y: 4 }, { w: 8, h: 8 });

		expect(atlas).toMatchObject({
			ok: true,
			value: {
				frames: {
					'test/frame': {
						frame: { x: 3, y: 4, w: 2, h: 2 },
						spriteSourceSize: { x: 1, y: 0, w: 2, h: 2 },
						sourceSize: { w: 4, h: 3 },
						trimmed: true
					}
				}
			}
		});
	});

	test('rejects transparent frames and out-of-bounds placements', () => {
		const transparent = trimRgbaFrame({ width: 2, height: 2, pixels: new Uint8Array(16) });

		if (!transparent.ok) {
			throw new Error(transparent.error);
		}

		expect(createPixiAtlasData('empty', transparent.value, { x: 0, y: 0 }, { w: 2, h: 2 })).toMatchObject({ ok: false });
		const trimmed = trimRgbaFrame(frame);

		if (!trimmed.ok) {
			throw new Error(trimmed.error);
		}

		expect(createPixiAtlasData('frame', trimmed.value, { x: 7, y: 7 }, { w: 8, h: 8 })).toMatchObject({ ok: false });
	});
});
