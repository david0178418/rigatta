import { strToU8 } from 'fflate';
import type { SpritesheetData } from 'pixi.js';
import type { EntityId } from '../domain/ids.ts';
import { frameCountForClip } from '../domain/playback.ts';
import {
	evaluatePose,
	gameplayFrameFromPose,
	type EvaluatedGameplayFrame,
	type EvaluatedPose
} from '../domain/pose.ts';
import type { Clip, Project } from '../domain/model.ts';
import { validateProject } from '../domain/validation.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import {
	createAnimationData,
	createPixiGridAtlasData,
	createPixiPackedAtlasData
} from './atlas.ts';
import type { ExportFrameCapture } from './capture.ts';
import {
	cancelledExport,
	exportError,
	exportFailure,
	exportSuccess,
	type ExportError,
	type ExportResult
} from './errors.ts';
import { composeGridFrames, createGridPageLayouts, type GridPageLayout } from './grid.ts';
import { createCompanionMetadata, type MetadataClipInput } from './metadata.ts';
import { createExportZip, createExportZipBlobFromBytes, safeExportFilenameFor, safeExportPathSegment, sortExportFiles, type ExportFile } from './package.ts';
import { composePackedAtlasPages, type PackedAtlasPage } from './packed-atlas.ts';
import { encodeRgbaPng } from './png.ts';
import { runExportBatches, yieldExportControl } from './progress.ts';
import { normalizeExportClipIds, type ExportOutputMode } from './selection.ts';
import { trimRgbaFrame, type RgbaFrame, type TrimmedRgbaFrame } from './trim.ts';

export type ExportProgressPhase = 'rendering' | 'composing' | 'packaging';

export type ExportProgress = Readonly<{
	phase: ExportProgressPhase;
	completed: number;
	total: number;
}>;

export type ExportRequest = Readonly<{
	project: Project;
	clipIds: readonly EntityId[];
	mode: ExportOutputMode;
	assets: ProjectAssetBlobs;
	frameCapture: ExportFrameCapture;
	signal?: AbortSignal;
	onProgress?: (progress: ExportProgress) => void;
	yieldControl?: () => Promise<void>;
	alphaThreshold?: number;
}>;

export type ExportFileResult = Readonly<{
	filename: string;
	files: readonly ExportFile[];
	zipBytes: Uint8Array;
	zipBlob: Blob;
	mode: ExportOutputMode;
	atlasMode: Project['exportSettings']['mode'];
	clipIds: readonly EntityId[];
	frameCount: number;
	pageCount: number;
}>;

export type ExportPlan = Readonly<{
	project: Project;
	assets: ProjectAssetBlobs;
	frameCapture: ExportFrameCapture;
	mode: ExportOutputMode;
	atlasMode: Project['exportSettings']['mode'];
	clipIds: readonly EntityId[];
	groups: readonly ExportGroupPlan[];
	frames: readonly ExportFramePlan[];
	alphaThreshold: number;
}>;

type ExportFramePlan = Readonly<{
	clip: Clip;
	clipSegment: string;
	index: number;
	timeSeconds: number;
	key: string;
}>;

type ExportGroupPlan = Readonly<{
	directory: string;
	clips: readonly Clip[];
	frames: readonly ExportFramePlan[];
}>;

type RenderedExportFrame = Readonly<{
	plan: ExportFramePlan;
	sample: Readonly<{
		clipId: EntityId;
		index: number;
		timeSeconds: number;
		pose: EvaluatedPose;
		gameplay: EvaluatedGameplayFrame;
	}>;
	frame: RgbaFrame;
}>;

type ComposedPage = Readonly<{
	index: number;
	frame: RgbaFrame;
	atlas: SpritesheetData;
	frameKeys: readonly string[];
}>;

type ComposedGroup = Readonly<{
	directory: string;
	files: readonly ExportFile[];
	frameCount: number;
	pageCount: number;
}>;

const validPositiveInteger = function validPositiveInteger(value: number): boolean {
	return Number.isInteger(value) && value > 0;
};

const validNonnegativeInteger = function validNonnegativeInteger(value: number): boolean {
	return Number.isInteger(value) && value >= 0;
};

const validOutputMode = function validOutputMode(value: ExportOutputMode): boolean {
	return value === 'combined' || value === 'per-clip';
};

const validAlphaThreshold = function validAlphaThreshold(value: number): boolean {
	return Number.isFinite(value) && value >= 0 && value <= 255;
};

const noProgress = function noProgress(): void {};

const isBlob = function isBlob(value: Blob | undefined): value is Blob {
	return typeof globalThis.Blob !== 'undefined' && value instanceof globalThis.Blob;
};

const errorWithFrameContext = function errorWithFrameContext(
	error: ExportError,
	frame: ExportFramePlan
): ExportError {
	return { ...error, clipId: frame.clip.id, frameIndex: frame.index };
};

const invalidRequest = function invalidRequest(
	message: string,
	path?: string
): ExportResult<never> {
	return exportFailure(exportError('invalid-request', 'validation', message, path ? { path } : {}));
};

const settingsErrorFor = function settingsErrorFor(project: Project): ExportError | undefined {
	const canvas = project.logicalCanvas;
	const settings = project.exportSettings;

	if (!validPositiveInteger(canvas.width) || !validPositiveInteger(canvas.height)) {
		return exportError('invalid-request', 'validation', 'Logical canvas dimensions must be positive integers.', { path: 'logicalCanvas' });
	}
	if (!validPositiveInteger(settings.maxTextureSize)) {
		return exportError('invalid-request', 'validation', 'Maximum texture size must be a positive integer.', { path: 'exportSettings.maxTextureSize' });
	}
	if (!validNonnegativeInteger(settings.padding)) {
		return exportError('invalid-request', 'validation', 'Atlas padding must be a nonnegative integer.', { path: 'exportSettings.padding' });
	}
	if (typeof settings.extrudeEdges !== 'boolean') {
		return exportError('invalid-request', 'validation', 'Atlas edge extrusion must be a boolean.', { path: 'exportSettings.extrudeEdges' });
	}

	return undefined;
};

const frameKeyFor = function frameKeyFor(clipSegment: string, index: number): string {
	return `${clipSegment}/frame-${String(index).padStart(4, '0')}`;
};

const framePlansFor = function framePlansFor(
	clip: Clip,
	clipSegment: string
): readonly ExportFramePlan[] {
	return Array.from({ length: frameCountForClip(clip) }, (_, index) => ({
		clip,
		clipSegment,
		index,
		timeSeconds: index / clip.fps,
		key: frameKeyFor(clipSegment, index)
	}));
};

const planFor = function planFor(request: ExportRequest): ExportResult<ExportPlan> {
	const projectDiagnostics = validateProject(request.project);
	const firstProjectDiagnostic = projectDiagnostics[0];

	if (firstProjectDiagnostic) {
		return exportFailure(exportError('invalid-project', 'validation', firstProjectDiagnostic.message, { path: firstProjectDiagnostic.path }));
	}
	if (!validOutputMode(request.mode)) {
		return invalidRequest('Export output mode must be combined or per-clip.', 'mode');
	}

	const settingsError = settingsErrorFor(request.project);

	if (settingsError) {
		return exportFailure(settingsError);
	}

	const alphaThreshold = request.alphaThreshold ?? 0;

	if (!validAlphaThreshold(alphaThreshold)) {
		return invalidRequest('Alpha threshold must be a finite value from 0 through 255.', 'alphaThreshold');
	}

	const clipIds = normalizeExportClipIds(request.project, request.clipIds);

	if (clipIds.length === 0) {
		return exportFailure(exportError('invalid-selection', 'validation', 'Select at least one animation clip before exporting.', { path: 'clipIds' }));
	}

	const selectedClips = request.project.clips.filter((clip) => clipIds.includes(clip.id));
	const clipSegments = selectedClips.map((clip) => ({
		clip,
		segment: safeExportPathSegment(clip.name, 'clip')
	}));
	const duplicateSegment = clipSegments.find((entry, index) => clipSegments.findIndex((candidate) => candidate.segment.toLowerCase() === entry.segment.toLowerCase()) !== index);

	if (duplicateSegment) {
		return invalidRequest(`Clip names produce duplicate safe output directories: ${duplicateSegment.segment}.`, 'clipIds');
	}

	const missingAsset = request.project.assets.find((asset) => !isBlob(request.assets.get(asset.id)));

	if (missingAsset) {
		return exportFailure(exportError('missing-asset', 'validation', `No image blob was supplied for asset ${missingAsset.relativePath}.`, { path: `assets.${missingAsset.id}` }));
	}

	const groups = request.mode === 'combined'
		? [{
			directory: '',
			clips: selectedClips,
			frames: clipSegments.flatMap(({ clip, segment }) => framePlansFor(clip, segment))
		}]
		: clipSegments.map(({ clip, segment }) => ({
			directory: segment,
			clips: [clip],
			frames: framePlansFor(clip, segment)
		}));
	const gridLayouts = request.project.exportSettings.mode === 'grid'
		? groups.map((group) => createGridPageLayouts(
			request.project.logicalCanvas.width,
			request.project.logicalCanvas.height,
			group.frames.length,
			request.project.exportSettings.maxTextureSize
		))
		: [];
	const failedGridLayout = gridLayouts.find((layout) => !layout);

	if (failedGridLayout && !failedGridLayout.ok) {
		return invalidRequest(failedGridLayout.error, 'exportSettings.maxTextureSize');
	}

	return exportSuccess({
		project: request.project,
		assets: request.assets,
		frameCapture: request.frameCapture,
		mode: request.mode,
		atlasMode: request.project.exportSettings.mode,
		clipIds,
		groups,
		frames: groups.flatMap((group) => group.frames),
		alphaThreshold
	});
};

export const createExportPlan = function createExportPlan(request: ExportRequest): ExportResult<ExportPlan> {
	return planFor(request);
};

const sampledFrameFor = function sampledFrameFor(
	plan: ExportPlan,
	frame: ExportFramePlan
): ExportResult<RenderedExportFrame['sample']> {
	const evaluated = evaluatePose(plan.project, frame.clip.id, frame.timeSeconds);

	if (!evaluated.pose) {
		const diagnostic = evaluated.diagnostics[0];

		return exportFailure(exportError(
			'sampling-failure',
			'rendering',
			diagnostic?.message ?? 'The sampled pose could not be evaluated.',
			{ clipId: frame.clip.id, frameIndex: frame.index, path: diagnostic?.path }
		));
	}

	return exportSuccess({
		clipId: frame.clip.id,
		index: frame.index,
		timeSeconds: frame.timeSeconds,
		pose: evaluated.pose,
		gameplay: gameplayFrameFromPose(evaluated.pose)
	});
};

const renderedFrameFor = async function renderedFrameFor(
	plan: ExportPlan,
	frame: ExportFramePlan,
	signal: AbortSignal | undefined
): Promise<ExportResult<RenderedExportFrame>> {
	if (signal?.aborted) {
		return cancelledExport({ clipId: frame.clip.id, frameIndex: frame.index });
	}

	const sampled = sampledFrameFor(plan, frame);

	if (!sampled.ok) {
		return sampled;
	}

	try {
		const captured = await plan.frameCapture.captureFrame(plan.project, sampled.value, plan.assets, signal);

		if (!captured.ok) {
			return exportFailure(errorWithFrameContext(captured.error, frame));
		}
		if (signal?.aborted) {
			return cancelledExport({ clipId: frame.clip.id, frameIndex: frame.index });
		}

		const widthMatches = captured.value.width === plan.project.logicalCanvas.width;
		const heightMatches = captured.value.height === plan.project.logicalCanvas.height;
		const bufferMatches = captured.value.pixels instanceof Uint8Array
			&& captured.value.pixels.byteLength === captured.value.width * captured.value.height * 4;

		if (!widthMatches || !heightMatches || !bufferMatches) {
			return exportFailure(exportError(
				'capture-failure',
				'rendering',
				'Captured frame dimensions do not match the logical canvas RGBA contract.',
				{ clipId: frame.clip.id, frameIndex: frame.index }
			));
		}

		return exportSuccess({
			plan: frame,
			sample: sampled.value,
			frame: { width: captured.value.width, height: captured.value.height, pixels: captured.value.pixels.slice() }
		});
	} catch (error: unknown) {
		return exportFailure(exportError(
			'render-failure',
			'rendering',
			error instanceof Error ? error.message : 'Export frame rendering failed.',
			{ clipId: frame.clip.id, frameIndex: frame.index }
		));
	}
};

const pathFor = function pathFor(directory: string, filename: string): string {
	return directory.length > 0 ? `${directory}/${filename}` : filename;
};

const compositionCodeFor = function compositionCodeFor(message: string): ExportError['code'] {
	return message.includes('does not fit') || message.includes('exceeds the atlas')
		? 'frame-too-large'
		: 'composition-failure';
};

const compositionFailure = function compositionFailure(
	message: string,
	frame?: ExportFramePlan
): ExportResult<never> {
	return exportFailure(exportError(
		compositionCodeFor(message),
		'composition',
		message,
		frame ? { clipId: frame.clip.id, frameIndex: frame.index } : {}
	));
};

const renderedFramesForGroup = function renderedFramesForGroup(
	group: ExportGroupPlan,
	renderedByWorkKey: ReadonlyMap<string, RenderedExportFrame>
): ExportResult<readonly RenderedExportFrame[]> {
	const rendered = group.frames.flatMap((frame) => {
		const item = renderedByWorkKey.get(`${frame.clip.id}:${frame.index}`);

		return item ? [item] : [];
	});

	return rendered.length === group.frames.length
		? exportSuccess(rendered)
		: compositionFailure('A rendered frame is unavailable during atlas composition.');
};

const pageFromGrid = function pageFromGrid(
	rendered: readonly RenderedExportFrame[],
	page: GridPageLayout
): ExportResult<ComposedPage> {
	const pageFrames = rendered.slice(page.offset, page.offset + page.layout.placements.length);
	const frameKeys = pageFrames.map((item) => item.plan.key);
	const composed = composeGridFrames(pageFrames.map((item) => item.frame), page.layout);

	if (!composed.ok) {
		return compositionFailure(composed.error, pageFrames[0]?.plan);
	}

	const atlas = createPixiGridAtlasData(frameKeys, page.layout, `atlas-${page.index}.png`);

	if (!atlas.ok) {
		return compositionFailure(atlas.error, pageFrames[0]?.plan);
	}

	return exportSuccess({
		index: page.index,
		frame: composed.value,
		atlas: atlas.value,
		frameKeys
	});
};

const packedPageFrom = function packedPageFrom(
	page: PackedAtlasPage,
	frames: readonly { key: string; frame: TrimmedRgbaFrame }[]
): ExportResult<ComposedPage> {
	const atlas = createPixiPackedAtlasData(page, frames, `atlas-${page.index}.png`);

	if (!atlas.ok) {
		return compositionFailure(atlas.error);
	}

	return exportSuccess({
		index: page.index,
		frame: page.frame,
		atlas: atlas.value,
		frameKeys: page.placements.map((placement) => placement.key)
	});
};

const metadataInputsFor = function metadataInputsFor(
	group: ExportGroupPlan,
	renderedByWorkKey: ReadonlyMap<string, RenderedExportFrame>,
	pageByFrameKey: ReadonlyMap<string, number>
): ExportResult<readonly MetadataClipInput[]> {
	const inputs = group.clips.map((clip): ExportResult<MetadataClipInput> => {
		const frames = group.frames.filter((frame) => frame.clip.id === clip.id);
		const rendered = frames.flatMap((frame) => {
			const item = renderedByWorkKey.get(`${frame.clip.id}:${frame.index}`);

			return item ? [item] : [];
		});
		const atlasPages = frames.flatMap((frame) => {
			const page = pageByFrameKey.get(frame.key);

			return page === undefined ? [] : [page];
		});

		if (rendered.length !== frames.length || atlasPages.length !== frames.length) {
			return compositionFailure(`Metadata placement is unavailable for clip ${clip.name}.`);
		}

		return exportSuccess({
			clip,
			frames: rendered.map((item) => item.sample),
			frameKeys: frames.map((frame) => frame.key),
			atlasPages
		});
	});
	const failed = inputs.find((input) => !input);

	return failed && !failed.ok
		? failed
		: exportSuccess(inputs.flatMap((input) => input.ok ? [input.value] : []));
};

const pageFilesFor = function pageFilesFor(
	directory: string,
	pages: readonly ComposedPage[]
): ExportResult<readonly ExportFile[]> {
	const pageResults = pages.map((page): ExportResult<readonly ExportFile[]> => {
		const png = encodePagePng(page.frame);

		if (!png.ok) {
			return exportFailure(png.error);
		}

		return exportSuccess([
			{ path: pathFor(directory, `atlas-${page.index}.png`), bytes: png.value },
			{ path: pathFor(directory, `atlas-${page.index}.json`), bytes: strToU8(JSON.stringify(page.atlas)) }
		]);
	});
const failed = pageResults.find((page) => !page);

	return failed && !failed.ok
		? failed
		: exportSuccess(pageResults.flatMap((page) => page.ok ? [...page.value] : []));
};

const encodePagePng = function encodePagePng(frame: RgbaFrame): ExportResult<Uint8Array> {
	const encoded = encodeRgbaPng(frame);

	return encoded.ok
		? exportSuccess(encoded.value)
		: compositionFailure(encoded.error);
};

const finishGroup = function finishGroup(
	project: Project,
	group: ExportGroupPlan,
	renderedByWorkKey: ReadonlyMap<string, RenderedExportFrame>,
	pages: readonly ComposedPage[]
): ExportResult<ComposedGroup> {
	const pageByFrameKey = new Map(pages.flatMap((page) => page.frameKeys.map((key) => [key, page.index] as const)));
	const metadataInputs = metadataInputsFor(group, renderedByWorkKey, pageByFrameKey);

	if (!metadataInputs.ok) {
		return metadataInputs;
	}

	const animationData = createAnimationData(metadataInputs.value.map((input) => ({
		name: input.clip.name,
		frameKeys: input.frameKeys
	})));

	if (!animationData.ok) {
		return compositionFailure(animationData.error);
	}

	const metadata = createCompanionMetadata(project, metadataInputs.value);

	if (!metadata.ok) {
		return compositionFailure(metadata.error);
	}

	const pageFiles = pageFilesFor(group.directory, pages);

	if (!pageFiles.ok) {
		return pageFiles;
	}

	const files = sortExportFiles([
		...pageFiles.value,
		{ path: pathFor(group.directory, 'animations.json'), bytes: strToU8(JSON.stringify(animationData.value)) },
		{ path: pathFor(group.directory, 'boneanim-metadata.json'), bytes: strToU8(JSON.stringify(metadata.value)) }
	]);

	return exportSuccess({ directory: group.directory, files, frameCount: group.frames.length, pageCount: pages.length });
};

const composeGridGroup = function composeGridGroup(
	plan: ExportPlan,
	group: ExportGroupPlan,
	renderedByWorkKey: ReadonlyMap<string, RenderedExportFrame>
): ExportResult<ComposedGroup> {
	const rendered = renderedFramesForGroup(group, renderedByWorkKey);

	if (!rendered.ok) {
		return rendered;
	}

	const layouts = createGridPageLayouts(
		plan.project.logicalCanvas.width,
		plan.project.logicalCanvas.height,
		group.frames.length,
		plan.project.exportSettings.maxTextureSize
	);

	if (!layouts.ok) {
		return compositionFailure(layouts.error, group.frames[0]);
	}

	const pageResults = layouts.value.map((page) => pageFromGrid(rendered.value, page));
	const failed = pageResults.find((page) => !page);

	if (failed && !failed.ok) {
		return failed;
	}

	return finishGroup(
		plan.project,
		group,
		new Map(rendered.value.map((item) => [`${item.plan.clip.id}:${item.plan.index}`, item] as const)),
		pageResults.flatMap((page) => page.ok ? [page.value] : [])
	);
};

const composePackedGroup = function composePackedGroup(
	plan: ExportPlan,
	group: ExportGroupPlan,
	renderedByWorkKey: ReadonlyMap<string, RenderedExportFrame>
): ExportResult<ComposedGroup> {
	const rendered = renderedFramesForGroup(group, renderedByWorkKey);

	if (!rendered.ok) {
		return rendered;
	}

	const trimResults = rendered.value.map((item) => trimRgbaFrame(item.frame, plan.alphaThreshold));
	const failedTrim = trimResults.find((trimmed) => !trimmed);

	if (failedTrim && !failedTrim.ok) {
		return compositionFailure(failedTrim.error);
	}

	const transparentIndex = trimResults.findIndex((trimmed) => trimmed.ok && trimmed.value.spriteSourceSize.w === 0);

	if (transparentIndex >= 0) {
		return exportFailure(exportError(
			'fully-transparent-frame',
			'composition',
			'Packed export cannot place a fully transparent frame; add visible pixels or use grid output.',
			{ clipId: rendered.value[transparentIndex]?.plan.clip.id, frameIndex: rendered.value[transparentIndex]?.plan.index }
		));
	}

	const frames = rendered.value.flatMap((item, index) => {
		const trimmed = trimResults[index];

		return trimmed?.ok ? [{ key: item.plan.key, frame: trimmed.value }] : [];
	});

	if (frames.length !== rendered.value.length) {
		return compositionFailure('A trimmed frame is unavailable during packed composition.', rendered.value[0]?.plan);
	}

	const packed = composePackedAtlasPages(frames, {
		size: {
			width: plan.project.exportSettings.maxTextureSize,
			height: plan.project.exportSettings.maxTextureSize
		},
		padding: plan.project.exportSettings.padding,
		extrudeEdges: plan.project.exportSettings.extrudeEdges
	});

	if (!packed.ok) {
		return compositionFailure(packed.error, rendered.value[0]?.plan);
	}

	const pageResults = packed.value.map((page) => packedPageFrom(page, frames));
	const failed = pageResults.find((page) => !page);

	if (failed && !failed.ok) {
		return failed;
	}

	return finishGroup(
		plan.project,
		group,
		new Map(rendered.value.map((item) => [`${item.plan.clip.id}:${item.plan.index}`, item] as const)),
		pageResults.flatMap((page) => page.ok ? [page.value] : [])
	);
};

const composeGroup = function composeGroup(
	plan: ExportPlan,
	group: ExportGroupPlan,
	renderedByWorkKey: ReadonlyMap<string, RenderedExportFrame>
): ExportResult<ComposedGroup> {
	return plan.atlasMode === 'grid'
		? composeGridGroup(plan, group, renderedByWorkKey)
		: composePackedGroup(plan, group, renderedByWorkKey);
};

const composeGroups = async function composeGroups(
	plan: ExportPlan,
	traces: readonly ComposedGroup[],
	renderedByWorkKey: ReadonlyMap<string, RenderedExportFrame>,
	index: number,
	yieldControl: () => Promise<void>,
	emitProgress: (phase: ExportProgressPhase) => void,
	signal: AbortSignal | undefined
): Promise<ExportResult<readonly ComposedGroup[]>> {
	if (signal?.aborted) {
		return cancelledExport();
	}
	if (index >= plan.groups.length) {
		return exportSuccess(traces);
	}

	const group = plan.groups[index];

	if (!group) {
		return compositionFailure('An export group is unavailable during composition.');
	}

	const composed = composeGroup(plan, group, renderedByWorkKey);

	if (!composed.ok) {
		return composed;
	}

	emitProgress('composing');

	if (index + 1 >= plan.groups.length) {
		return exportSuccess([...traces, composed.value]);
	}

	await yieldControl();

	return composeGroups(plan, [...traces, composed.value], renderedByWorkKey, index + 1, yieldControl, emitProgress, signal);
};

const unexpectedFailure = function unexpectedFailure(
	phase: ExportError['phase'],
	error: unknown
): ExportResult<never> {
	return exportFailure(exportError(
		'unexpected-failure',
		phase,
		error instanceof Error ? error.message : 'Export failed unexpectedly.'
	));
};

const executeExport = async function executeExport(
	request: ExportRequest
): Promise<ExportResult<ExportFileResult>> {
	const plan = planFor(request);

	if (!plan.ok) {
		return plan;
	}
	if (request.signal?.aborted) {
		return cancelledExport();
	}

	const onProgress: NonNullable<ExportRequest['onProgress']> = request.onProgress ?? noProgress;
	const emitProgress = function emitProgress(phase: ExportProgressPhase, completed: number = plan.value.frames.length): void {
		onProgress({ phase, completed, total: plan.value.frames.length });
	};

	emitProgress('rendering', 0);

	const renderedResults = await runExportBatches(plan.value.frames, (frame) => renderedFrameFor(plan.value, frame, request.signal), {
		batchSize: 1,
		signal: request.signal,
		onProgress: (progress) => emitProgress('rendering', progress.completed),
		yieldControl: request.yieldControl ?? yieldExportControl
	});

	if (!renderedResults.ok) {
		return renderedResults.code === 'cancelled'
			? cancelledExport()
			: unexpectedFailure('rendering', renderedResults.error);
	}

	const failedRender = renderedResults.value.find((result) => !result.ok);

	if (failedRender && !failedRender.ok) {
		return failedRender;
	}
	if (request.signal?.aborted) {
		return cancelledExport();
	}

	const rendered = renderedResults.value.flatMap((result) => result.ok ? [result.value] : []);
	const renderedByWorkKey = new Map(rendered.map((item) => [`${item.plan.clip.id}:${item.plan.index}`, item] as const));
	const yieldControl = request.yieldControl ?? yieldExportControl;
	const composed = await composeGroups(plan.value, [], renderedByWorkKey, 0, yieldControl, (phase) => emitProgress(phase), request.signal);

	if (!composed.ok) {
		return composed;
	}
	if (request.signal?.aborted) {
		return cancelledExport();
	}

	emitProgress('packaging');

	const files = sortExportFiles(composed.value.flatMap((group) => [...group.files]));
	const archive = createExportZip(files);

	if (!archive.ok) {
		return exportFailure(exportError('packaging-failure', 'packaging', archive.error));
	}

	const blob = createExportZipBlobFromBytes(archive.value);

	if (!blob.ok) {
		return exportFailure(exportError('packaging-failure', 'packaging', blob.error));
	}
	if (request.signal?.aborted) {
		return cancelledExport();
	}

	return exportSuccess({
		filename: safeExportFilenameFor(plan.value.project.name),
		files,
		zipBytes: archive.value,
		zipBlob: blob.value,
		mode: plan.value.mode,
		atlasMode: plan.value.atlasMode,
		clipIds: plan.value.clipIds,
		frameCount: plan.value.frames.length,
		pageCount: composed.value.reduce((count, group) => count + group.pageCount, 0)
	});
};

export const runExport = async function runExport(
	request: ExportRequest
): Promise<ExportResult<ExportFileResult>> {
	const result = await executeExport(request).catch((error: unknown) => unexpectedFailure('rendering', error));

	try {
		request.frameCapture.dispose();
	} catch (error: unknown) {
		return unexpectedFailure('cleanup', error);
	}

	return result;
};

export const orchestrateExport = runExport;
