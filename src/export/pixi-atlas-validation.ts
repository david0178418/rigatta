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

const success = function success(value: ReloadedPixiFrame): PixiAtlasValidationResult {
	return { ok: true, value };
};

const failure = function failure(error: string): PixiAtlasValidationResult {
	return { ok: false, error };
};

export const reloadPixiAtlasFrame = async function reloadPixiAtlasFrame(
	canvas: HTMLCanvasElement,
	data: SpritesheetData,
	frameKey: string
): Promise<PixiAtlasValidationResult> {
	let sheet: Spritesheet | undefined;

	try {
		const texture = Texture.from(canvas);

		sheet = new Spritesheet({ texture, data });
		const textures = await sheet.parse();
		const frameTexture = Object.entries(textures).find(([key]) => key === frameKey)?.[1];

		if (!frameTexture) {
			return failure(`Pixi did not reload atlas frame ${frameKey}.`);
		}

		return success({
			frame: {
				x: frameTexture.frame.x,
				y: frameTexture.frame.y,
				w: frameTexture.frame.width,
				h: frameTexture.frame.height
			},
			sourceSize: { w: frameTexture.orig.width, h: frameTexture.orig.height },
			spriteSourceSize: {
				x: frameTexture.trim.x,
				y: frameTexture.trim.y,
				w: frameTexture.trim.width,
				h: frameTexture.trim.height
			}
		});
	} catch (error: unknown) {
		return failure(error instanceof Error ? error.message : 'Pixi atlas reload failed.');
	} finally {
		sheet?.destroy(true);
	}
};
