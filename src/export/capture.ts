import type { CanvasSize, Project } from '../domain/model.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import type { FixedCanvasRenderer } from '../rendering/fixed-canvas.ts';
import type { RendererError } from '../rendering/renderer-types.ts';
import type { SampledClipFrame } from './sampling.ts';
import { cancelledExport, exportError, exportFailure, exportSuccess, type ExportErrorCode, type ExportResult } from './errors.ts';
import type { RgbaFrame } from './trim.ts';

export type ExportFrameCaptureRenderer = Pick<FixedCanvasRenderer, 'renderPose' | 'capturePng' | 'destroy'>;

export type ExportPngDecoder = (
	blob: Blob,
	size: CanvasSize
) => Promise<ExportResult<RgbaFrame>>;

export type ExportFrameCapture = Readonly<{
	captureFrame: (
		project: Project,
		sample: SampledClipFrame,
		assets: ProjectAssetBlobs,
		signal?: AbortSignal
	) => Promise<ExportResult<RgbaFrame>>;
	dispose: () => void;
}>;

const validPositiveInteger = function validPositiveInteger(value: number): boolean {
	return Number.isInteger(value) && value > 0;
};

const validCanvasSize = function validCanvasSize(size: CanvasSize): boolean {
	return validPositiveInteger(size.width) && validPositiveInteger(size.height);
};

const validRgbaFrame = function validRgbaFrame(
	frame: RgbaFrame,
	size: CanvasSize
): boolean {
	return validCanvasSize(size)
		&& frame.width === size.width
		&& frame.height === size.height
		&& frame.pixels instanceof Uint8Array
		&& frame.pixels.byteLength === frame.width * frame.height * 4;
};

export const validateCapturedRgbaFrame = function validateCapturedRgbaFrame(
	frame: RgbaFrame,
	size: CanvasSize
): ExportResult<RgbaFrame> {
	return validRgbaFrame(frame, size)
		? exportSuccess({ width: frame.width, height: frame.height, pixels: frame.pixels.slice() })
		: exportFailure(exportError(
			'capture-failure',
			'rendering',
			'Captured frame dimensions do not match the logical canvas RGBA contract.'
		));
};

const rendererExportCode = function rendererExportCode(code: RendererError['code']): ExportErrorCode {
	const codes: Readonly<Record<RendererError['code'], ExportErrorCode>> = {
		'unsupported-browser': 'unsupported-browser',
		'invalid-project': 'invalid-project',
		'invalid-asset': 'missing-asset',
		'renderer-failure': 'render-failure'
	};

	return codes[code];
};

const rendererFailureFor = function rendererFailureFor(
	error: RendererError,
	sample: SampledClipFrame
): ExportResult<never> {
	return exportFailure(exportError(
		rendererExportCode(error.code),
		'rendering',
		error.message,
		{ clipId: sample.clipId, frameIndex: sample.index, cause: error.code }
	));
};

const decodeFailureFor = function decodeFailureFor(
	error: unknown,
	size: CanvasSize
): ReturnType<typeof exportError> {
	return exportError(
		'capture-failure',
		'rendering',
		error instanceof Error ? error.message : `Could not decode the ${size.width} × ${size.height} export frame.`
	);
};

const bitmapCloseFailure = function bitmapCloseFailure(error: unknown): ExportResult<never> {
	return exportFailure(exportError(
		'capture-failure',
		'cleanup',
		error instanceof Error ? `Captured frame resource cleanup failed: ${error.message}` : 'Captured frame resource cleanup failed.'
	));
};

const decodedBitmapResult = function decodedBitmapResult(
	bitmap: ImageBitmap,
	size: CanvasSize
): ExportResult<RgbaFrame> {
	const decoded = ((): ExportResult<RgbaFrame> => {
		try {
			if (bitmap.width !== size.width || bitmap.height !== size.height) {
				return exportFailure(exportError(
					'capture-failure',
					'rendering',
					`Captured PNG dimensions ${bitmap.width} × ${bitmap.height} do not match the logical canvas ${size.width} × ${size.height}.`
				));
			}

			if (typeof document === 'undefined') {
				return exportFailure(exportError('unsupported-browser', 'rendering', 'This browser cannot create a frame capture canvas.'));
			}

			const canvas = document.createElement('canvas');
			canvas.width = size.width;
			canvas.height = size.height;
			const context = canvas.getContext('2d', { willReadFrequently: true });

			if (!context) {
				return exportFailure(exportError('capture-failure', 'rendering', 'The frame capture canvas has no 2D context.'));
			}

			context.imageSmoothingEnabled = false;
			context.clearRect(0, 0, size.width, size.height);
			context.drawImage(bitmap, 0, 0);

			const imageData = context.getImageData(0, 0, size.width, size.height);

			return validateCapturedRgbaFrame({
				width: imageData.width,
				height: imageData.height,
				pixels: Uint8Array.from(imageData.data)
			}, size);
		} catch (error: unknown) {
			return exportFailure(decodeFailureFor(error, size));
		}
	})();

	try {
		bitmap.close();
	} catch (error: unknown) {
		return bitmapCloseFailure(error);
	}

	return decoded;
};

export const decodeExportPng = async function decodeExportPng(
	blob: Blob,
	size: CanvasSize
): Promise<ExportResult<RgbaFrame>> {
	if (!validCanvasSize(size)) {
		return exportFailure(exportError('invalid-request', 'validation', 'Frame capture dimensions must be positive integers.'));
	}
	if (typeof document === 'undefined' || typeof createImageBitmap !== 'function') {
		return exportFailure(exportError('unsupported-browser', 'rendering', 'This browser cannot decode PNG frame captures.'));
	}

	try {
		const bitmap = await createImageBitmap(blob);

		return decodedBitmapResult(bitmap, size);
	} catch (error: unknown) {
		return exportFailure(decodeFailureFor(error, size));
	}
};

const exportRenderOptions = {
	gridVisible: false,
	showBones: false,
	showGameplay: false,
	showSelectionGuides: false,
	showTransformHandles: false,
	selectedIds: []
} as const;

const captureFailureWithSample = function captureFailureWithSample(
	result: ExportResult<RgbaFrame>,
	sample: SampledClipFrame
): ExportResult<RgbaFrame> {
	if (result.ok) {
		return result;
	}

	return exportFailure({
		...result.error,
		clipId: sample.clipId,
		frameIndex: sample.index
	});
};

export const createExportFrameCaptureAdapter = function createExportFrameCaptureAdapter(
	renderer: ExportFrameCaptureRenderer,
	options: Readonly<{ decodePng?: ExportPngDecoder }> = {}
): ExportFrameCapture {
	const decodePng = options.decodePng ?? decodeExportPng;

	const captureFrame = async function captureFrame(
		project: Project,
		sample: SampledClipFrame,
		assets: ProjectAssetBlobs,
		signal?: AbortSignal
	): Promise<ExportResult<RgbaFrame>> {
		if (signal?.aborted) {
			return cancelledExport({ clipId: sample.clipId, frameIndex: sample.index });
		}

		const rendered = await renderer.renderPose(project, sample.pose, assets, exportRenderOptions);

		if (!rendered.ok) {
			return rendererFailureFor(rendered.error, sample);
		}
		if (signal?.aborted) {
			return cancelledExport({ clipId: sample.clipId, frameIndex: sample.index });
		}

		const captured = await renderer.capturePng();

		if (!captured.ok) {
			return rendererFailureFor(captured.error, sample);
		}
		if (signal?.aborted) {
			return cancelledExport({ clipId: sample.clipId, frameIndex: sample.index });
		}

		try {
			const decoded = await decodePng(captured.value, project.logicalCanvas);

			return captureFailureWithSample(decoded, sample);
		} catch (error: unknown) {
			return exportFailure({
				...decodeFailureFor(error, project.logicalCanvas),
				clipId: sample.clipId,
				frameIndex: sample.index
			});
		}
	};

	return { captureFrame, dispose: renderer.destroy };
};
