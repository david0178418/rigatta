import { describe, expect, test } from 'bun:test';
import { strFromU8, unzipSync } from 'fflate';
import { createClip } from '../../src/domain/animation.ts';
import type { CanvasSize, Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createExportFrameCaptureAdapter, type ExportFrameCaptureRenderer, type ExportPngDecoder } from '../../src/export/capture.ts';
import { exportError, exportFailure, exportSuccess, type ExportResult } from '../../src/export/errors.ts';
import { runExport, type ExportProgress, type ExportRequest } from '../../src/export/orchestrator.ts';
import { sampleClipFrames, type SampledClipFrame } from '../../src/export/sampling.ts';
import type { RgbaFrame } from '../../src/export/trim.ts';
import { rendererSuccess, type FixedCanvasRenderOptions, type RendererResult } from '../../src/rendering/renderer-types.ts';
import { createExampleAssetBlobs, exampleProject } from '../../src/examples/example-project.ts';
import { createRigProject } from '../fixtures.ts';
import type { EvaluatedPose } from '../../src/domain/pose.ts';

const firstClipId = '123e4567-e89b-42d3-a456-4266141740b0';
const secondClipId = '123e4567-e89b-42d3-a456-4266141740b1';

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const projectWithClip = function projectWithClip(
	settings: Partial<Project['exportSettings']> = {},
	clipName: string = 'walk'
): Project {
	const base = {
		...createRigProject(),
		logicalCanvas: { width: 4, height: 4 },
		exportSettings: {
			...createRigProject().exportSettings,
			maxTextureSize: 8,
			...settings
		}
	};

	return unwrap(createClip(base, {
		name: clipName,
		durationSeconds: 0.5,
		fps: 4
	}, () => firstClipId));
};

const projectWithTwoClips = function projectWithTwoClips(
	settings: Partial<Project['exportSettings']> = {}
): Project {
	const first = projectWithClip(settings);

	return unwrap(createClip(first, {
		name: 'idle',
		durationSeconds: 0.25,
		fps: 4
	}, () => secondClipId));
};

const assetsFor = function assetsFor(project: Project): ReadonlyMap<string, Blob> {
	return new Map(project.assets.map((asset) => [
		asset.id,
		new Blob([new ArrayBuffer(1)], { type: asset.mimeType })
	] as const));
};

const frameFor = function frameFor(
	size: CanvasSize,
	index: number,
	transparent: boolean = false,
	full: boolean = false
): RgbaFrame {
	const pixelCount = size.width * size.height;
	const pixels = Uint8Array.from(Array.from({ length: pixelCount }, (_, pixelIndex) => {
		const visible = !transparent && (full || pixelIndex === Math.min(5, pixelCount - 1));

		return visible ? [index + 1, 40, 80, 255] : [0, 0, 0, 0];
	}).flat());

	return { width: size.width, height: size.height, pixels };
};

type CaptureHooks = Readonly<{
	afterCapture?: (sample: SampledClipFrame, count: number) => void;
}>;

const captureFor = function captureFor(
	frameFactory: (sample: SampledClipFrame) => RgbaFrame,
	hooks: CaptureHooks = {}
): Readonly<{
	capture: ExportRequest['frameCapture'];
	samples: SampledClipFrame[];
	disposals: boolean[];
}> {
	const samples: SampledClipFrame[] = [];
	const disposals: boolean[] = [];

	const captureFrame = async function captureFrame(
		project: Project,
		sample: SampledClipFrame,
		assets: ReadonlyMap<string, Blob>,
		signal?: AbortSignal
	): Promise<ExportResult<RgbaFrame>> {
		void project;
		void assets;
		void signal;
		samples.push(sample);
		hooks.afterCapture?.(sample, samples.length);

		return exportSuccess(frameFactory(sample));
	};

	return {
		capture: { captureFrame, dispose: () => disposals.push(true) },
		samples,
		disposals
	};
};

const requestFor = function requestFor(
	project: Project,
	frameCapture: ExportRequest['frameCapture'],
	mode: ExportRequest['mode'] = 'combined',
	overrides: Pick<ExportRequest, 'signal' | 'onProgress' | 'yieldControl' | 'alphaThreshold'> = {}
): ExportRequest {
	return {
		project,
		clipIds: project.clips.map((clip) => clip.id),
		mode,
		assets: assetsFor(project),
		frameCapture,
		...overrides
	};
};

describe('export frame capture adapter', () => {
	test('uses the shared pose renderer with every authoring overlay disabled and releases it', async () => {
		const project = projectWithClip();
		const clip = project.clips[0];

		if (!clip) {
			throw new Error('The capture fixture clip is unavailable.');
		}

		const sample = sampleClipFrames(project, clip.id).frames[0];

		if (!sample) {
			throw new Error('The capture fixture sample is unavailable.');
		}

		const renderOptions: FixedCanvasRenderOptions[] = [];
		const renderedPoses: EvaluatedPose[] = [];
		const disposed: boolean[] = [];
		const renderer: ExportFrameCaptureRenderer = {
			renderPose: async (_project, pose, _assets, options): Promise<RendererResult<void>> => {
				renderedPoses.push(pose);
				renderOptions.push(options ?? {});

				return rendererSuccess(undefined);
			},
			capturePng: async (): Promise<RendererResult<Blob>> => rendererSuccess(new Blob([new ArrayBuffer(1)], { type: 'image/png' })),
			destroy: () => disposed.push(true)
		};
		const decoder: ExportPngDecoder = async (_blob, size) => exportSuccess(frameFor(size, 3));
		const adapter = createExportFrameCaptureAdapter(renderer, { decodePng: decoder });
		const result = await adapter.captureFrame(project, sample, assetsFor(project));

		if (!result.ok) {
			throw new Error(result.error.message);
		}

		const options = renderOptions[0];

		if (!options) {
			throw new Error('The renderer options were not recorded.');
		}

		expect(renderedPoses).toEqual([sample.pose]);
		expect(options).toMatchObject({
			gridVisible: false,
			showBones: false,
			showGameplay: false,
			showSelectionGuides: false,
			showTransformHandles: false,
			selectedIds: []
		});
		expect(result.value).toEqual(frameFor(project.logicalCanvas, 3));

		adapter.dispose();
		expect(disposed).toHaveLength(1);
	});
});

describe('export orchestration', () => {
	test('builds deterministic combined grid output with pages, animation JSON, metadata, and one ZIP Blob', async () => {
		const project = projectWithClip({ mode: 'grid', maxTextureSize: 8 });
		const first = captureFor((sample) => frameFor(project.logicalCanvas, sample.index));
		const second = captureFor((sample) => frameFor(project.logicalCanvas, sample.index));
		const progress: ExportProgress[] = [];
		const request = requestFor(project, first.capture, 'combined', {
			onProgress: (value) => progress.push(value),
			yieldControl: async () => undefined
		});
		const result = await runExport(request);
		const repeated = await runExport(requestFor(project, second.capture, 'combined', { yieldControl: async () => undefined }));

		if (!result.ok) {
			throw new Error(result.error.message);
		}
		if (!repeated.ok) {
			throw new Error(repeated.error.message);
		}

		expect(result.value.filename).toBe('Untitled-project.zip');
		expect(result.value.frameCount).toBe(2);
		expect(result.value.pageCount).toBe(1);
		expect(result.value.zipBytes).toEqual(repeated.value.zipBytes);
		expect(result.value.zipBlob.type).toBe('application/zip');
		expect(Object.keys(unzipSync(result.value.zipBytes))).toEqual([
			'animations.json',
			'atlas-0.json',
			'atlas-0.png',
			'rigatta-metadata.json'
		]);
		expect(progress.map(({ completed }) => completed)).toEqual([0, 1, 2, 2, 2]);
		expect(progress.every((value, index) => index === 0 || value.completed >= progress[index - 1]?.completed)).toBe(true);
		expect(first.samples.map((sample) => sample.timeSeconds)).toEqual([0, 0.25]);
		expect(first.disposals).toHaveLength(1);

		const atlas = result.value.files.find((file) => file.path === 'atlas-0.json');
		const metadata = result.value.files.find((file) => file.path === 'rigatta-metadata.json');

		if (!atlas || !metadata) {
			throw new Error('The combined grid JSON files are unavailable.');
		}

		expect(JSON.parse(strFromU8(atlas.bytes))).toMatchObject({ meta: { image: 'atlas-0.png', size: { w: 8, h: 4 } } });
		expect(JSON.parse(strFromU8(metadata.bytes))).toMatchObject({ clips: { walk: { frames: [{ atlasPage: 0 }, { atlasPage: 0 }] } } });
	});

	test('builds per-clip packed output with safe directories and preserved trim metadata', async () => {
		const project = {
			...projectWithTwoClips({ mode: 'packed', maxTextureSize: 6, padding: 1, extrudeEdges: true }),
			name: 'Robot / Export'
		};
		const capture = captureFor((sample) => frameFor(project.logicalCanvas, sample.index));
		const result = await runExport(requestFor(project, capture.capture, 'per-clip', { yieldControl: async () => undefined }));

		if (!result.ok) {
			throw new Error(result.error.message);
		}

		expect(result.value.filename).toBe('Robot-Export.zip');
		expect(result.value.pageCount).toBe(2);
		expect(result.value.files.map((file) => file.path)).toEqual([
			'idle/animations.json',
			'idle/atlas-0.json',
			'idle/atlas-0.png',
			'idle/rigatta-metadata.json',
			'walk/animations.json',
			'walk/atlas-0.json',
			'walk/atlas-0.png',
			'walk/rigatta-metadata.json'
		]);

		const walkAtlas = result.value.files.find((file) => file.path === 'walk/atlas-0.json');

		if (!walkAtlas) {
			throw new Error('The packed atlas JSON is unavailable.');
		}

		expect(JSON.parse(strFromU8(walkAtlas.bytes))).toMatchObject({
			frames: { 'walk/frame-0000': { trimmed: true, sourceSize: { w: 4, h: 4 } } }
		});
	});

	test('uses actual sampled example poses through the injected frame boundary', async () => {
		const capture = captureFor((sample) => frameFor(exampleProject.logicalCanvas, sample.index));
		const result = await runExport({
			...requestFor(exampleProject, capture.capture),
			assets: createExampleAssetBlobs(),
			yieldControl: async () => undefined
		});

		if (!result.ok) {
			throw new Error(result.error.message);
		}

		expect(capture.samples).toHaveLength(12);
		expect(capture.samples.map((sample) => sample.pose.timeSeconds)).toEqual(
			[...Array(12).keys()].map((index) => index / 12)
		);
		expect(result.value.frameCount).toBe(12);
		expect(result.value.files.some((file) => file.path === 'rigatta-metadata.json')).toBe(true);
	});

	test('returns typed transparent and oversized-frame errors without packaging', async () => {
		const transparentProject = projectWithClip({ mode: 'packed', maxTextureSize: 8 });
		const transparentCapture = captureFor((sample) => frameFor(transparentProject.logicalCanvas, sample.index, true));
		const transparent = await runExport(requestFor(transparentProject, transparentCapture.capture));

		expect(transparent).toMatchObject({ ok: false, error: { code: 'fully-transparent-frame', phase: 'composition' } });
		expect(transparentCapture.disposals).toHaveLength(1);

		const oversizedProject = projectWithClip({ mode: 'packed', maxTextureSize: 4, padding: 1 });
		const oversizedCapture = captureFor((sample) => frameFor(oversizedProject.logicalCanvas, sample.index, false, true));
		const oversized = await runExport(requestFor(oversizedProject, oversizedCapture.capture));

		expect(oversized).toMatchObject({ ok: false, error: { code: 'frame-too-large', phase: 'composition' } });
		expect(oversizedCapture.disposals).toHaveLength(1);
	});

	test('cancels between frame batches and never produces a package', async () => {
		const project = projectWithClip({ mode: 'grid' });
		const controller = new AbortController();
		const capture = captureFor(
			(sample) => frameFor(project.logicalCanvas, sample.index),
			{ afterCapture: (_sample, count) => count === 1 && controller.abort() }
		);
		const result = await runExport(requestFor(project, capture.capture, 'combined', {
			signal: controller.signal,
			yieldControl: async () => undefined
		}));

		expect(result).toMatchObject({ ok: false, error: { code: 'cancelled' } });
		expect(capture.samples).toHaveLength(1);
		expect(capture.disposals).toHaveLength(1);
	});

	test('rejects invalid configuration before frame capture and still disposes the adapter', async () => {
		const project = projectWithClip({ mode: 'grid', maxTextureSize: 2 });
		const capture = captureFor((sample) => frameFor(project.logicalCanvas, sample.index));
		const result = await runExport({
			...requestFor(project, capture.capture),
			clipIds: []
		});

		expect(result).toMatchObject({ ok: false, error: { code: 'invalid-selection', phase: 'validation' } });
		expect(capture.samples).toHaveLength(0);
		expect(capture.disposals).toHaveLength(1);
	});

	test('normalizes renderer failures into typed frame errors without partial output', async () => {
		const project = projectWithClip();
		const disposals: boolean[] = [];
		const capture: ExportRequest['frameCapture'] = {
			captureFrame: async (): Promise<ExportResult<RgbaFrame>> => exportFailure(exportError('render-failure', 'rendering', 'Synthetic render failure.')),
			dispose: () => disposals.push(true)
		};
		const result = await runExport(requestFor(project, capture));

		expect(result).toMatchObject({ ok: false, error: { code: 'render-failure', clipId: firstClipId, frameIndex: 0 } });
		expect(disposals).toHaveLength(1);
	});
});
