import { createPixiAtlasData } from './atlas.ts';
import {
	reloadPixiAtlasFrames,
	type PixiAtlasFramesValidationResult
} from './pixi-atlas-validation.ts';
import type { SpritesheetData } from 'pixi.js';
import { trimRgbaFrame } from './trim.ts';

export type AtlasValidationRequest = Readonly<{
	pngBytes: readonly number[];
	atlasData: SpritesheetData;
	frameKeys: readonly string[];
}>;

export type AtlasValidationHook = (
	request: AtlasValidationRequest
) => Promise<PixiAtlasFramesValidationResult>;

declare global {
	interface Window {
		__boneAnimationValidateAtlas?: AtlasValidationHook;
	}
}

const validationFrame = {
	width: 4,
	height: 3,
	pixels: Uint8Array.from([
		0, 0, 0, 0, 10, 20, 30, 255, 0, 0, 0, 0, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 40, 50, 60, 128, 0, 0, 0, 0,
		0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
	])
};

const validateAtlasRequest = async function validateAtlasRequest(
	request: AtlasValidationRequest
): Promise<PixiAtlasFramesValidationResult> {
	let image: ImageBitmap | undefined;

	try {
		image = await createImageBitmap(new Blob([Uint8Array.from(request.pngBytes)], { type: 'image/png' }));
		const canvas = document.createElement('canvas');
		canvas.width = image.width;
		canvas.height = image.height;
		const context = canvas.getContext('2d');

		if (!context) {
			return { ok: false, error: 'The atlas validation canvas could not be created.' };
		}

		context.drawImage(image, 0, 0);
		return reloadPixiAtlasFrames(canvas, request.atlasData, request.frameKeys);
	} catch (error: unknown) {
		return { ok: false, error: error instanceof Error ? error.message : 'Atlas validation failed.' };
	} finally {
		image?.close();
	}
};

export const runAtlasValidationPage = async function runAtlasValidationPage(): Promise<void> {
	const output = document.createElement('pre');
	output.id = 'atlas-validation-result';
	document.body.replaceChildren(output);
	window.__boneAnimationValidateAtlas = validateAtlasRequest;

	try {
		const trimmed = trimRgbaFrame(validationFrame);

		if (!trimmed.ok) {
			throw new Error(trimmed.error);
		}

		const atlas = createPixiAtlasData('test/frame', trimmed.value, { x: 3, y: 4 }, { w: 8, h: 8 });

		if (!atlas.ok) {
			throw new Error(atlas.error);
		}

		const canvas = document.createElement('canvas');
		canvas.width = 8;
		canvas.height = 8;
		const context = canvas.getContext('2d');

		if (!context) {
			throw new Error('The atlas validation canvas could not be created.');
		}

		context.putImageData(new ImageData(new Uint8ClampedArray(trimmed.value.pixels), 2, 2), 3, 4);
		const validation = await reloadPixiAtlasFrames(canvas, atlas.value, ['test/frame']);
		const serialized = JSON.stringify(validation);

		output.dataset.result = serialized;
		output.textContent = serialized;
	} catch (error: unknown) {
		const serialized = JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Atlas validation failed.' });

		output.dataset.result = serialized;
		output.textContent = serialized;
	}
};
