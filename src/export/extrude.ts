import type { RgbaFrame } from './trim.ts';

export type ExtrusionResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

const validFrame = function validFrame(frame: RgbaFrame): boolean {
	return Number.isInteger(frame.width)
		&& Number.isInteger(frame.height)
		&& frame.width > 0
		&& frame.height > 0
		&& frame.pixels.byteLength === frame.width * frame.height * 4;
};

const validPadding = function validPadding(padding: number): boolean {
	return Number.isInteger(padding) && padding >= 0;
};

export const extrudeRgbaFrame = function extrudeRgbaFrame(
	frame: RgbaFrame,
	padding: number
): ExtrusionResult<RgbaFrame> {
	if (!validFrame(frame)) {
		return { ok: false, error: 'RGBA frame dimensions do not match its pixel buffer.' };
	}
	if (!validPadding(padding)) {
		return { ok: false, error: 'Extrusion padding must be a nonnegative integer.' };
	}

	const width = frame.width + padding * 2;
	const height = frame.height + padding * 2;
	const pixels = new Uint8Array(width * height * 4);

	Array.from({ length: height }, (_, y) => y).forEach((y) => {
		const sourceY = Math.max(0, Math.min(frame.height - 1, y - padding));

		Array.from({ length: width }, (_, x) => x).forEach((x) => {
			const sourceX = Math.max(0, Math.min(frame.width - 1, x - padding));
			const sourceStart = (sourceY * frame.width + sourceX) * 4;
			const targetStart = (y * width + x) * 4;

			pixels.set(frame.pixels.subarray(sourceStart, sourceStart + 4), targetStart);
		});
	});

	return { ok: true, value: { width, height, pixels } };
};
