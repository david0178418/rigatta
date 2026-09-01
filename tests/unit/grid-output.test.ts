import { describe, expect, test } from 'bun:test';
import { createAnimationData, createPixiGridAtlasData } from '../../src/export/atlas.ts';
import { createGridLayout } from '../../src/export/grid.ts';

describe('grid Pixi output', () => {
	test('generates untrimmed Pixi frames from grid placements', () => {
		const layout = createGridLayout(2, 1, 2, 4);

		if (!layout.ok) {
			throw new Error(layout.error);
		}

		const result = createPixiGridAtlasData(['walk/frame-0000', 'walk/frame-0001'], layout.value);

		if (!result.ok) {
			throw new Error(result.error);
		}

		expect(result.value.frames['walk/frame-0000']).toEqual({
			frame: { x: 0, y: 0, w: 2, h: 1 },
			rotated: false,
			trimmed: false,
			spriteSourceSize: { x: 0, y: 0, w: 2, h: 1 },
			sourceSize: { w: 2, h: 1 }
		});
		expect(result.value.frames['walk/frame-0001']?.frame).toEqual({ x: 2, y: 0, w: 2, h: 1 });
		expect(result.value.meta.size).toEqual({ w: 4, h: 1 });
	});

	test('generates animation JSON in clip and frame order', () => {
		const result = createAnimationData([
			{ name: 'walk', frameKeys: ['walk/frame-0000', 'walk/frame-0001'] },
			{ name: 'idle', frameKeys: ['idle/frame-0000'] }
		]);

		if (!result.ok) {
			throw new Error(result.error);
		}

		expect(result.value).toEqual({
			animations: {
				walk: ['walk/frame-0000', 'walk/frame-0001'],
				idle: ['idle/frame-0000']
			}
		});
	});

	test('rejects duplicate animation names and frame keys', () => {
		expect(createAnimationData([
			{ name: 'walk', frameKeys: ['frame-0'] },
			{ name: 'walk', frameKeys: ['frame-1'] }
		])).toMatchObject({ ok: false });
		expect(createAnimationData([
			{ name: 'walk', frameKeys: ['frame-0'] },
			{ name: 'idle', frameKeys: ['frame-0'] }
		])).toMatchObject({ ok: false });
	});
});
