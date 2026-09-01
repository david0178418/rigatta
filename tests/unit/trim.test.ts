import { describe, expect, test } from 'bun:test';
import { restoreTrimmedRgbaFrame, scanAlphaBounds, trimRgbaFrame } from '../../src/export/trim.ts';

const frame = {
	width: 4,
	height: 3,
	pixels: Uint8Array.from([
		0, 0, 0, 0, 10, 20, 30, 255, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 40, 50, 60, 128, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
	])
};

describe('alpha trimming', () => {
	test('scans visible alpha bounds with an explicit threshold', () => {
		expect(scanAlphaBounds(frame)).toEqual({ ok: true, value: { x: 1, y: 0, w: 2, h: 2 } });
		expect(scanAlphaBounds(frame, 200)).toEqual({ ok: true, value: { x: 1, y: 0, w: 1, h: 1 } });
		expect(scanAlphaBounds(frame, 256)).toMatchObject({ ok: false });
	});

	test('crops visible pixels and preserves Pixi source metadata', () => {
		const trimmed = trimRgbaFrame(frame);

		expect(trimmed.ok).toBe(true);
		if (!trimmed.ok) {
			return;
		}

		expect(trimmed.value.sourceSize).toEqual({ w: 4, h: 3 });
		expect(trimmed.value.spriteSourceSize).toEqual({ x: 1, y: 0, w: 2, h: 2 });
		expect(trimmed.value.pixels).toEqual(Uint8Array.from([
		10, 20, 30, 255, 0, 0, 0, 0,
		0, 0, 0, 0, 40, 50, 60, 128
		]));

		const restored = restoreTrimmedRgbaFrame(trimmed.value);

		expect(restored).toEqual({ ok: true, value: frame });
	});

	test('handles fully transparent frames and invalid buffers', () => {
		const transparent = trimRgbaFrame({ width: 2, height: 2, pixels: new Uint8Array(16) });
		const invalid = trimRgbaFrame({ width: 2, height: 2, pixels: new Uint8Array(3) });

		expect(transparent).toMatchObject({
			ok: true,
			value: { sourceSize: { w: 2, h: 2 }, spriteSourceSize: { x: 0, y: 0, w: 0, h: 0 } }
		});
		expect(invalid).toMatchObject({ ok: false });
	});
});
