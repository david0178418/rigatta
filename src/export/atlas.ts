import type { SpritesheetData, SpritesheetFrameData } from 'pixi.js';
import type { FrameBounds, FrameSize, TrimmedRgbaFrame } from './trim.ts';

export type AtlasPlacement = Readonly<{
	x: number;
	y: number;
}>;

export type AtlasSize = Readonly<{
	w: number;
	h: number;
}>;

export type AtlasResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

const success = function success<TValue>(value: TValue): AtlasResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(error: string): AtlasResult<never> {
	return { ok: false, error };
};

const isPositiveInteger = function isPositiveInteger(value: number): boolean {
	return Number.isInteger(value) && value > 0;
};

const isNonnegativeInteger = function isNonnegativeInteger(value: number): boolean {
	return Number.isInteger(value) && value >= 0;
};

const validFrameBounds = function validFrameBounds(bounds: FrameBounds): boolean {
	return isNonnegativeInteger(bounds.x)
		&& isNonnegativeInteger(bounds.y)
		&& isNonnegativeInteger(bounds.w)
		&& isNonnegativeInteger(bounds.h);
};

export const createPixiAtlasFrame = function createPixiAtlasFrame(
	trimmed: TrimmedRgbaFrame,
	placement: AtlasPlacement
): AtlasResult<SpritesheetFrameData> {
	const sourceSize: FrameSize = trimmed.sourceSize;
	const spriteSourceSize: FrameBounds = trimmed.spriteSourceSize;

	if (!isPositiveInteger(sourceSize.w) || !isPositiveInteger(sourceSize.h)) {
		return failure('Atlas source dimensions must be positive integers.');
	}
	if (!validFrameBounds(spriteSourceSize) || spriteSourceSize.w === 0 || spriteSourceSize.h === 0) {
		return failure('Fully transparent frames need a dedicated atlas placeholder.');
	}
	if (!isNonnegativeInteger(placement.x) || !isNonnegativeInteger(placement.y)) {
		return failure('Atlas placements must use nonnegative integer coordinates.');
	}

	return success({
		frame: {
			x: placement.x,
			y: placement.y,
			w: spriteSourceSize.w,
			h: spriteSourceSize.h
		},
		rotated: false,
		trimmed: trimmed.trimmed,
		spriteSourceSize,
		sourceSize
	});
};

export const createPixiAtlasData = function createPixiAtlasData(
	frameKey: string,
	trimmed: TrimmedRgbaFrame,
	placement: AtlasPlacement,
	atlasSize: AtlasSize,
	imageFilename: string = 'atlas-0.png'
): AtlasResult<SpritesheetData> {
	if (frameKey.trim().length === 0) {
		return failure('Atlas frame keys must be non-empty.');
	}
	if (!isPositiveInteger(atlasSize.w) || !isPositiveInteger(atlasSize.h)) {
		return failure('Atlas dimensions must be positive integers.');
	}

	const frame = createPixiAtlasFrame(trimmed, placement);

	if (!frame.ok) {
		return frame;
	}
	if (placement.x + frame.value.frame.w > atlasSize.w || placement.y + frame.value.frame.h > atlasSize.h) {
		return failure('Atlas frame placement exceeds the atlas dimensions.');
	}

	return success({
		frames: { [frameKey]: frame.value },
		meta: {
			app: 'Bone Animation Utility',
			format: 'RGBA8888',
			image: imageFilename,
			size: atlasSize,
			scale: '1',
			version: '1'
		}
	});
};
