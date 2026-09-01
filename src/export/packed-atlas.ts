import { extrudeRgbaFrame } from './extrude.ts';
import { packMaxRectsPages, type PackedAtlas, type PackedRectangle, type PackSize, type PackingResult } from './packing.ts';
import type { RgbaFrame, TrimmedRgbaFrame } from './trim.ts';

export type PackedFrameInput = Readonly<{
	key: string;
	frame: TrimmedRgbaFrame;
}>;

export type PackedAtlasOptions = Readonly<{
	size: PackSize;
	padding: number;
	extrudeEdges: boolean;
}>;

export type PackedAtlasPage = Readonly<{
	index: number;
	size: PackSize;
	padding: number;
	frame: RgbaFrame;
	placements: readonly PackedRectangle[];
}>;

const success = function success<TValue>(value: TValue): PackingResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(error: string): PackingResult<never> {
	return { ok: false, error };
};

const validPositiveInteger = function validPositiveInteger(value: number): boolean {
	return Number.isInteger(value) && value > 0;
};

const validNonnegativeInteger = function validNonnegativeInteger(value: number): boolean {
	return Number.isInteger(value) && value >= 0;
};

const validTrimmedFrame = function validTrimmedFrame(frame: TrimmedRgbaFrame): boolean {
	const { sourceSize, spriteSourceSize } = frame;

	return validPositiveInteger(sourceSize.w)
		&& validPositiveInteger(sourceSize.h)
		&& validPositiveInteger(spriteSourceSize.w)
		&& validPositiveInteger(spriteSourceSize.h)
		&& spriteSourceSize.x >= 0
		&& spriteSourceSize.y >= 0
		&& spriteSourceSize.x + spriteSourceSize.w <= sourceSize.w
		&& spriteSourceSize.y + spriteSourceSize.h <= sourceSize.h
		&& frame.pixels.byteLength === spriteSourceSize.w * spriteSourceSize.h * 4;
};

const packedFrameError = function packedFrameError(
	frames: readonly PackedFrameInput[],
	options: PackedAtlasOptions
): string | undefined {
	if (!validPositiveInteger(options.size.width) || !validPositiveInteger(options.size.height)) {
		return 'Packed atlas dimensions must be positive integers.';
	}
	if (!validNonnegativeInteger(options.padding)) {
		return 'Packed atlas padding must be a nonnegative integer.';
	}
	if (frames.some((item) => item.key.trim().length === 0)) {
		return 'Packed frame keys must be non-empty.';
	}
	if (new Set(frames.map((item) => item.key)).size !== frames.length) {
		return 'Packed frame keys must be unique.';
	}

	return frames.some((item) => !validTrimmedFrame(item.frame))
		? 'Packed frames must contain positive visible bounds and matching RGBA buffers.'
		: undefined;
};

const copyFrame = function copyFrame(
	target: Uint8Array,
	targetSize: PackSize,
	frame: RgbaFrame,
	x: number,
	y: number
): void {
	Array.from({ length: frame.height }, (_, row) => row).forEach((row) => {
		const sourceStart = row * frame.width * 4;
		const targetStart = ((y + row) * targetSize.width + x) * 4;

		target.set(frame.pixels.subarray(sourceStart, sourceStart + frame.width * 4), targetStart);
	});
};

const composePage = function composePage(
	page: PackedAtlas,
	framesByKey: ReadonlyMap<string, RgbaFrame>,
	options: PackedAtlasOptions
): PackingResult<RgbaFrame> {
	const pixels = new Uint8Array(page.size.width * page.size.height * 4);

	const copied = page.placements.reduce<PackingResult<Uint8Array>>((result, placement) => {
		if (!result.ok) {
			return result;
		}

		const frame = framesByKey.get(placement.key);
		const inset = options.extrudeEdges ? options.padding : 0;
		const x = placement.x - inset;
		const y = placement.y - inset;

		if (!frame) {
			return failure(`Packed frame ${placement.key} is unavailable during composition.`);
		}
		if (x < 0 || y < 0 || x + frame.width > page.size.width || y + frame.height > page.size.height) {
			return failure(`Packed frame ${placement.key} exceeds the atlas page.`);
		}

		copyFrame(result.value, page.size, frame, x, y);
		return result;
	}, success(pixels));

	return copied.ok ? success({ width: page.size.width, height: page.size.height, pixels: copied.value }) : copied;
};

export const composePackedAtlasPages = function composePackedAtlasPages(
	frames: readonly PackedFrameInput[],
	options: PackedAtlasOptions
): PackingResult<readonly PackedAtlasPage[]> {
	const inputError = packedFrameError(frames, options);

	if (inputError) {
		return failure(inputError);
	}

	const preparedResults = frames.map((item): PackingResult<Readonly<{ key: string; frame: RgbaFrame }>> => {
		const source: RgbaFrame = {
			width: item.frame.spriteSourceSize.w,
			height: item.frame.spriteSourceSize.h,
			pixels: item.frame.pixels
		};
		const prepared = options.extrudeEdges ? extrudeRgbaFrame(source, options.padding) : success(source);

		return prepared.ok ? success({ key: item.key, frame: prepared.value }) : prepared;
	});
	const failedPreparation = preparedResults.find((result) => !result.ok);

	if (failedPreparation && !failedPreparation.ok) {
		return failedPreparation;
	}

	const framesByKey = new Map(preparedResults.flatMap((result) => result.ok ? [[result.value.key, result.value.frame] as const] : []));
	const packed = packMaxRectsPages(frames.map((item) => ({
		key: item.key,
		width: item.frame.spriteSourceSize.w,
		height: item.frame.spriteSourceSize.h
	})), options.size, options.padding);

	if (!packed.ok) {
		return packed;
	}

	const pages = packed.value.reduce<PackingResult<readonly PackedAtlasPage[]>>((result, page, index) => {
		if (!result.ok) {
			return result;
		}

		const composed = composePage(page, framesByKey, options);

		return composed.ok
			? success([...result.value, { index, size: page.size, padding: page.padding, frame: composed.value, placements: page.placements }])
			: composed;
	}, success([]));

	return pages;
};
