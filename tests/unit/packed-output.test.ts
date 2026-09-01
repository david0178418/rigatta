import { describe, expect, test } from 'bun:test';
import { createPixiPackedAtlasData } from '../../src/export/atlas.ts';
import { composePackedAtlasPages } from '../../src/export/packed-atlas.ts';
import type { TrimmedRgbaFrame } from '../../src/export/trim.ts';

const trimmedFrame: TrimmedRgbaFrame = {
	sourceSize: { w: 4, h: 4 },
	spriteSourceSize: { x: 1, y: 1, w: 2, h: 2 },
	pixels: new Uint8Array(16),
	trimmed: true
};

describe('packed Pixi output', () => {
	test('retains trim metadata while using packed frame coordinates', () => {
		const packed = composePackedAtlasPages([{ key: 'walk/frame-0000', frame: trimmedFrame }], {
			size: { width: 8, height: 8 },
			padding: 1,
			extrudeEdges: false
		});

		if (!packed.ok) {
			throw new Error(packed.error);
		}

		const page = packed.value[0];

		if (!page) {
			throw new Error('The packed page is unavailable.');
		}

		const result = createPixiPackedAtlasData(page, [{ key: 'walk/frame-0000', frame: trimmedFrame }]);

		if (!result.ok) {
			throw new Error(result.error);
		}

		expect(result.value.frames['walk/frame-0000']).toMatchObject({
			frame: { x: 1, y: 1, w: 2, h: 2 },
			rotated: false,
			trimmed: true,
			spriteSourceSize: { x: 1, y: 1, w: 2, h: 2 },
			sourceSize: { w: 4, h: 4 }
		});
	});

	test('rejects missing source metadata for a packed placement', () => {
		const packed = composePackedAtlasPages([{ key: 'frame-0', frame: trimmedFrame }], {
			size: { width: 8, height: 8 },
			padding: 0,
			extrudeEdges: false
		});

		if (!packed.ok || !packed.value[0]) {
			throw new Error('The packed page is unavailable.');
		}

		expect(createPixiPackedAtlasData(packed.value[0], [])).toMatchObject({ ok: false });
	});
});
