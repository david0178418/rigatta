import { describe, expect, test } from 'bun:test';
import { composePackedAtlasPages } from '../../src/export/packed-atlas.ts';
import type { TrimmedRgbaFrame } from '../../src/export/trim.ts';

const trimmedFrame: TrimmedRgbaFrame = {
	sourceSize: { w: 4, h: 4 },
	spriteSourceSize: { x: 1, y: 1, w: 2, h: 2 },
	pixels: Uint8Array.from([
		10, 0, 0, 255, 20, 0, 0, 255,
		30, 0, 0, 255, 40, 0, 0, 255
	]),
	trimmed: true
};

describe('packed atlas composition', () => {
	test('composes a trimmed frame at its visible placement', () => {
		const result = composePackedAtlasPages([{ key: 'frame-0', frame: trimmedFrame }], {
			size: { width: 6, height: 6 },
			padding: 1,
			extrudeEdges: false
		});

		if (!result.ok) {
			throw new Error(result.error);
		}

		const placement = result.value[0]?.placements[0];

		if (!placement) {
			throw new Error('The packed placement is unavailable.');
		}

		const pixelStart = (placement.y * 6 + placement.x) * 4;
		expect([...result.value[0].frame.pixels.slice(pixelStart, pixelStart + 8)]).toEqual([
			10, 0, 0, 255, 20, 0, 0, 255
		]);
	});

	test('fills reserved padding with edge pixels when extrusion is enabled', () => {
		const result = composePackedAtlasPages([{ key: 'frame-0', frame: trimmedFrame }], {
			size: { width: 6, height: 6 },
			padding: 1,
			extrudeEdges: true
		});

		if (!result.ok) {
			throw new Error(result.error);
		}

		const placement = result.value[0]?.placements[0];

		if (!placement) {
			throw new Error('The packed placement is unavailable.');
		}

		const paddingStart = ((placement.y - 1) * 6 + placement.x - 1) * 4;
		expect([...result.value[0].frame.pixels.slice(paddingStart, paddingStart + 4)]).toEqual([10, 0, 0, 255]);
	});

	test('rejects fully transparent packed frames', () => {
		const transparent: TrimmedRgbaFrame = {
			sourceSize: { w: 4, h: 4 },
			spriteSourceSize: { x: 0, y: 0, w: 0, h: 0 },
			pixels: new Uint8Array(),
			trimmed: true
		};

		expect(composePackedAtlasPages([{ key: 'empty', frame: transparent }], {
			size: { width: 6, height: 6 },
			padding: 1,
			extrudeEdges: false
		})).toMatchObject({ ok: false });
	});
});
