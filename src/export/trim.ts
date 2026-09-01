export type RgbaFrame = Readonly<{
	width: number;
	height: number;
	pixels: Uint8Array;
}>;

export type FrameSize = Readonly<{
	w: number;
	h: number;
}>;

export type FrameBounds = Readonly<{
	x: number;
	y: number;
	w: number;
	h: number;
}>;

export type TrimmedRgbaFrame = Readonly<{
	sourceSize: FrameSize;
	spriteSourceSize: FrameBounds;
	pixels: Uint8Array;
	trimmed: boolean;
}>;

export type TrimResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

const success = function success<TValue>(value: TValue): TrimResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(error: string): TrimResult<never> {
	return { ok: false, error };
};

const isValidDimension = function isValidDimension(value: number): boolean {
	return Number.isInteger(value) && value > 0;
};

const isValidFrame = function isValidFrame(frame: RgbaFrame): boolean {
	return isValidDimension(frame.width)
		&& isValidDimension(frame.height)
		&& frame.pixels.byteLength === frame.width * frame.height * 4;
};

const normalizedThreshold = function normalizedThreshold(threshold: number): number | undefined {
	return Number.isFinite(threshold) && threshold >= 0 && threshold <= 255 ? threshold : undefined;
};

const visibleBounds = function visibleBounds(
	frame: RgbaFrame,
	alphaThreshold: number
): FrameBounds | undefined {
	const pixelIndexes = Array.from({ length: frame.width * frame.height }, (_, index) => index);
	const visibleIndexes = pixelIndexes.filter((index) => frame.pixels[index * 4 + 3] > alphaThreshold);

	if (visibleIndexes.length === 0) {
		return undefined;
	}

	const coordinates = visibleIndexes.map((index) => ({
		x: index % frame.width,
		y: Math.floor(index / frame.width)
	}));
	const xValues = coordinates.map((coordinate) => coordinate.x);
	const yValues = coordinates.map((coordinate) => coordinate.y);
	const minX = Math.min(...xValues);
	const minY = Math.min(...yValues);
	const maxX = Math.max(...xValues);
	const maxY = Math.max(...yValues);

	return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
};

export const scanAlphaBounds = function scanAlphaBounds(
	frame: RgbaFrame,
	alphaThreshold: number = 0
): TrimResult<FrameBounds | undefined> {
	if (!isValidFrame(frame)) {
		return failure('RGBA frame dimensions do not match its pixel buffer.');
	}

	const threshold = normalizedThreshold(alphaThreshold);

	return threshold === undefined
		? failure('Alpha threshold must be a finite value from 0 through 255.')
		: success(visibleBounds(frame, threshold));
};

const cropPixels = function cropPixels(
	frame: RgbaFrame,
	bounds: FrameBounds
): Uint8Array {
	const rowByteLength = bounds.w * 4;
	const cropped = new Uint8Array(bounds.w * bounds.h * 4);

	Array.from({ length: bounds.h }, (_, row) => row).forEach((row) => {
		const sourceStart = ((bounds.y + row) * frame.width + bounds.x) * 4;
		const targetStart = row * rowByteLength;

		cropped.set(frame.pixels.subarray(sourceStart, sourceStart + rowByteLength), targetStart);
	});

	return cropped;
};

export const trimRgbaFrame = function trimRgbaFrame(
	frame: RgbaFrame,
	alphaThreshold: number = 0
): TrimResult<TrimmedRgbaFrame> {
	const boundsResult = scanAlphaBounds(frame, alphaThreshold);

	if (!boundsResult.ok) {
		return boundsResult;
	}

	const bounds = boundsResult.value;

	if (!bounds) {
		return success({
			sourceSize: { w: frame.width, h: frame.height },
			spriteSourceSize: { x: 0, y: 0, w: 0, h: 0 },
			pixels: new Uint8Array(),
			trimmed: true
		});
	}

	return success({
		sourceSize: { w: frame.width, h: frame.height },
		spriteSourceSize: bounds,
		pixels: cropPixels(frame, bounds),
		trimmed: bounds.w !== frame.width || bounds.h !== frame.height || bounds.x !== 0 || bounds.y !== 0
	});
};

export const restoreTrimmedRgbaFrame = function restoreTrimmedRgbaFrame(
	frame: TrimmedRgbaFrame
): TrimResult<RgbaFrame> {
	if (!isValidDimension(frame.sourceSize.w)
		|| !isValidDimension(frame.sourceSize.h)
		|| frame.spriteSourceSize.x < 0
		|| frame.spriteSourceSize.y < 0
		|| frame.spriteSourceSize.w < 0
		|| frame.spriteSourceSize.h < 0
		|| frame.spriteSourceSize.x + frame.spriteSourceSize.w > frame.sourceSize.w
		|| frame.spriteSourceSize.y + frame.spriteSourceSize.h > frame.sourceSize.h
		|| frame.pixels.byteLength !== frame.spriteSourceSize.w * frame.spriteSourceSize.h * 4) {
		return failure('Trimmed frame metadata does not match its pixel buffer.');
	}

	const pixels = new Uint8Array(frame.sourceSize.w * frame.sourceSize.h * 4);
	const rowByteLength = frame.spriteSourceSize.w * 4;

	Array.from({ length: frame.spriteSourceSize.h }, (_, row) => row).forEach((row) => {
		const sourceStart = row * rowByteLength;
		const targetStart = ((frame.spriteSourceSize.y + row) * frame.sourceSize.w + frame.spriteSourceSize.x) * 4;

		pixels.set(frame.pixels.subarray(sourceStart, sourceStart + rowByteLength), targetStart);
	});

	return success({ width: frame.sourceSize.w, height: frame.sourceSize.h, pixels });
};
