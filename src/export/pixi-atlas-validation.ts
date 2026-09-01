import { Spritesheet, Texture, type SpritesheetData } from 'pixi.js';
import type { FrameBounds, FrameSize } from './trim.ts';

export type ReloadedPixiFrame = Readonly<{
	frame: FrameBounds;
	sourceSize: FrameSize;
	spriteSourceSize: FrameBounds;
}>;

export type PixiAtlasValidationResult =
	| Readonly<{ ok: true; value: ReloadedPixiFrame }>
	| Readonly<{ ok: false; error: string }>;

export type PixiAtlasFramesValidationResult =
	| Readonly<{ ok: true; value: readonly ReloadedPixiFrame[] }>
	| Readonly<{ ok: false; error: string }>;

const success = function success(value: ReloadedPixiFrame): PixiAtlasValidationResult {
	return { ok: true, value };
};

const failure = function failure(error: string): PixiAtlasValidationResult {
	return { ok: false, error };
};

const framesFailure = function framesFailure(error: string): PixiAtlasFramesValidationResult {
	return { ok: false, error };
};

const readFrame = function readFrame(texture: Texture): ReloadedPixiFrame {
	return {
		frame: {
			x: texture.frame.x,
			y: texture.frame.y,
			w: texture.frame.width,
			h: texture.frame.height
		},
		sourceSize: { w: texture.orig.width, h: texture.orig.height },
		spriteSourceSize: {
			x: texture.trim.x,
			y: texture.trim.y,
			w: texture.trim.width,
			h: texture.trim.height
		}
	};
};

export const reloadPixiAtlasFrames = async function reloadPixiAtlasFrames(
	canvas: HTMLCanvasElement,
	data: SpritesheetData,
	frameKeys: readonly string[]
): Promise<PixiAtlasFramesValidationResult> {
	if (frameKeys.length === 0 || frameKeys.some((key) => key.trim().length === 0)) {
		return framesFailure('Pixi atlas validation requires non-empty frame keys.');
	}

	let sheet: Spritesheet | undefined;

	try {
		const texture = Texture.from(canvas);

		sheet = new Spritesheet({ texture, data });
		const textures = await sheet.parse();
		const frameTextures = frameKeys.map((key) => textures[key]);
		const missingIndex = frameTextures.findIndex((frameTexture) => !frameTexture);

		if (missingIndex >= 0) {
			return framesFailure(`Pixi did not reload atlas frame ${frameKeys[missingIndex] ?? ''}.`);
		}

		return {
			ok: true,
			value: frameTextures.flatMap((frameTexture) => frameTexture ? [readFrame(frameTexture)] : [])
		};
	} catch (error: unknown) {
		return framesFailure(error instanceof Error ? error.message : 'Pixi atlas reload failed.');
	} finally {
		sheet?.destroy(true);
	}
};

export const reloadPixiAtlasFrame = async function reloadPixiAtlasFrame(
	canvas: HTMLCanvasElement,
	data: SpritesheetData,
	frameKey: string
): Promise<PixiAtlasValidationResult> {
	const frames = await reloadPixiAtlasFrames(canvas, data, [frameKey]);

	if (!frames.ok) {
		return failure(frames.error);
	}

	const frame = frames.value[0];

	return frame ? success(frame) : failure(`Pixi did not reload atlas frame ${frameKey}.`);
};
