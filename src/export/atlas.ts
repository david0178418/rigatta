import type { SpritesheetData, SpritesheetFrameData } from 'pixi.js';
import type { FrameBounds, FrameSize, TrimmedRgbaFrame } from './trim.ts';
import type { GridLayout } from './grid.ts';
import type { PackedAtlasPage, PackedFrameInput } from './packed-atlas.ts';

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

export type AnimationClipFrames = Readonly<{
	name: string;
	frameKeys: readonly string[];
}>;

export type AnimationJson = Readonly<{
	animations: Readonly<Record<string, readonly string[]>>;
}>;

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

export const createPixiGridAtlasData = function createPixiGridAtlasData(
	frameKeys: readonly string[],
	layout: GridLayout,
	imageFilename: string = 'atlas-0.png'
): AtlasResult<SpritesheetData> {
	if (frameKeys.length !== layout.placements.length) {
		return failure('Grid frame keys do not match the layout.');
	}
	if (frameKeys.some((key) => key.trim().length === 0)) {
		return failure('Grid frame keys must be non-empty.');
	}
	if (new Set(frameKeys).size !== frameKeys.length) {
		return failure('Grid frame keys must be unique.');
	}
	if (!isPositiveInteger(layout.width) || !isPositiveInteger(layout.height)) {
		return failure('Grid atlas dimensions must be positive integers.');
	}

	const frames = Object.fromEntries(layout.placements.flatMap((placement) => {
		const frameKey = frameKeys[placement.index];

		return frameKey ? [[frameKey, {
			frame: {
				x: placement.x,
				y: placement.y,
				w: placement.width,
				h: placement.height
			},
			rotated: false,
			trimmed: false,
			spriteSourceSize: { x: 0, y: 0, w: placement.width, h: placement.height },
			sourceSize: { w: placement.width, h: placement.height }
		} as SpritesheetFrameData] as const] : [];
	}));

	return success({
		frames,
		meta: {
			app: 'Bone Animation Utility',
			format: 'RGBA8888',
			image: imageFilename,
			size: { w: layout.width, h: layout.height },
			scale: '1',
			version: '1'
		}
	});
};

export const createPixiPackedAtlasData = function createPixiPackedAtlasData(
	page: PackedAtlasPage,
	frames: readonly PackedFrameInput[],
	imageFilename: string = `atlas-${page.index}.png`
): AtlasResult<SpritesheetData> {
	if (!isPositiveInteger(page.size.width) || !isPositiveInteger(page.size.height)) {
		return failure('Packed atlas dimensions must be positive integers.');
	}

	const framesByKey = new Map(frames.map((item) => [item.key, item.frame] as const));
	const frameEntries = page.placements.reduce<AtlasResult<Record<string, SpritesheetFrameData>>>((result, placement) => {
		if (!result.ok) {
			return result;
		}

		const source = framesByKey.get(placement.key);

		if (!source) {
			return failure(`Packed frame ${placement.key} is unavailable.`);
		}

		const frame = createPixiAtlasFrame(source, { x: placement.x, y: placement.y });

		return frame.ok
			? success({ ...result.value, [placement.key]: frame.value })
			: frame;
	}, success({}));

	if (!frameEntries.ok) {
		return frameEntries;
	}

	return success({
		frames: frameEntries.value,
		meta: {
			app: 'Bone Animation Utility',
			format: 'RGBA8888',
			image: imageFilename,
			size: { w: page.size.width, h: page.size.height },
			scale: '1',
			version: '1'
		}
	});
};

export const createAnimationData = function createAnimationData(
	clips: readonly AnimationClipFrames[]
): AtlasResult<AnimationJson> {
	const names = clips.map((clip) => clip.name);
	const frameKeys = clips.flatMap((clip) => clip.frameKeys);

	if (clips.some((clip) => clip.name.trim().length === 0)) {
		return failure('Animation names must be non-empty.');
	}
	if (new Set(names).size !== names.length) {
		return failure('Animation names must be unique.');
	}
	if (frameKeys.some((key) => key.trim().length === 0)) {
		return failure('Animation frame keys must be non-empty.');
	}
	if (new Set(frameKeys).size !== frameKeys.length) {
		return failure('Animation frame keys must be unique across clips.');
	}

	return success({
		animations: Object.fromEntries(clips.map((clip) => [clip.name, clip.frameKeys]))
	});
};
