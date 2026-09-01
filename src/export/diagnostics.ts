import { frameCountForClip } from '../domain/playback.ts';
import type { Project } from '../domain/model.ts';
import type { StorageReport } from '../persistence/storage.ts';
import { createGridLayout } from './grid.ts';
import { normalizeExportClipIds, type ExportClipSelection } from './selection.ts';

export type ExportDiagnosticCode = 'atlas-size' | 'storage-quota' | 'export-memory';
export type ExportDiagnosticSeverity = 'warning' | 'error';

export type ExportDiagnostic = Readonly<{
	code: ExportDiagnosticCode;
	severity: ExportDiagnosticSeverity;
	path: string;
	message: string;
}>;

export type ExportMemoryEstimate = Readonly<{
	frameCount: number;
	sampledFrameBytes: number;
	atlasBytes: number;
	metadataBytes: number;
	totalBytes: number;
}>;

export type ExportDiagnosticsOptions = Readonly<{
	storageReport?: StorageReport;
	requiredStorageBytes?: number;
	memoryLimitBytes?: number;
}>;

export type ExportDiagnosticsResult = Readonly<{
	diagnostics: readonly ExportDiagnostic[];
	memory: ExportMemoryEstimate;
}>;

export const DEFAULT_EXPORT_MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;

const BYTES_PER_RGBA_PIXEL = 4;
const ESTIMATED_METADATA_BYTES_PER_FRAME = 512;
const STORAGE_HEADROOM_BYTES = 16 * 1024 * 1024;

const diagnostic = function diagnostic(
	code: ExportDiagnosticCode,
	severity: ExportDiagnosticSeverity,
	path: string,
	message: string
): ExportDiagnostic {
	return { code, severity, path, message };
};

const selectedClipsFor = function selectedClipsFor(
	project: Project,
	selection: ExportClipSelection
): readonly Project['clips'][number][] {
	const selectedIds = normalizeExportClipIds(project, selection.clipIds);

	return project.clips.filter((clip) => selectedIds.includes(clip.id));
};

const clipGroupsFor = function clipGroupsFor(
	project: Project,
	selection: ExportClipSelection
): readonly (readonly Project['clips'][number][])[] {
	const clips = selectedClipsFor(project, selection);

	return selection.mode === 'combined' ? [clips] : clips.map((clip) => [clip]);
};

const frameCountForClips = function frameCountForClips(
	clips: readonly Project['clips'][number][]
): number {
	return clips.reduce((count, clip) => count + frameCountForClip(clip), 0);
};

const atlasDimensionsForGroup = function atlasDimensionsForGroup(
	project: Project,
	clips: readonly Project['clips'][number][]
): Readonly<{ width: number; height: number }> | undefined {
	if (!Number.isInteger(project.exportSettings.maxTextureSize) || project.exportSettings.maxTextureSize < 1) {
		return undefined;
	}
	if (project.exportSettings.mode === 'packed') {
		return {
			width: project.exportSettings.maxTextureSize,
			height: project.exportSettings.maxTextureSize
		};
	}

	const layout = createGridLayout(
		project.logicalCanvas.width,
		project.logicalCanvas.height,
		frameCountForClips(clips),
		project.exportSettings.maxTextureSize
	);

	return layout.ok ? { width: layout.value.width, height: layout.value.height } : undefined;
};

export const formatByteCount = function formatByteCount(bytes: number): string {
	if (bytes < 1024) {
		return `${Math.round(bytes)} B`;
	}
	if (bytes < 1024 * 1024) {
		return `${(bytes / 1024).toFixed(1)} KiB`;
	}

	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
};

export const estimateExportMemory = function estimateExportMemory(
	project: Project,
	selection: ExportClipSelection
): ExportMemoryEstimate {
	const groups = clipGroupsFor(project, selection);
	const frameCount = groups.reduce((count, clips) => count + frameCountForClips(clips), 0);
	const framePixels = project.logicalCanvas.width * project.logicalCanvas.height;
	const sampledFrameBytes = frameCount * framePixels * BYTES_PER_RGBA_PIXEL;
	const atlasBytes = groups.reduce((bytes, clips) => {
		const dimensions = atlasDimensionsForGroup(project, clips);

		return dimensions ? bytes + dimensions.width * dimensions.height * BYTES_PER_RGBA_PIXEL : bytes;
	}, 0);
	const metadataBytes = frameCount * ESTIMATED_METADATA_BYTES_PER_FRAME;

	return {
		frameCount,
		sampledFrameBytes,
		atlasBytes,
		metadataBytes,
		totalBytes: sampledFrameBytes + atlasBytes + metadataBytes
	};
};

const atlasDiagnosticsFor = function atlasDiagnosticsFor(
	project: Project,
	selection: ExportClipSelection
): readonly ExportDiagnostic[] {
	const maxTextureSize = project.exportSettings.maxTextureSize;
	const invalidSize = !Number.isInteger(maxTextureSize) || maxTextureSize < 1;
	const sizeDiagnostic = invalidSize
		? [diagnostic('atlas-size', 'error', 'exportSettings.maxTextureSize', 'Maximum texture size must be a positive integer.')]
		: [];

	if (invalidSize || project.exportSettings.mode === 'packed') {
		return sizeDiagnostic;
	}

	const groups = clipGroupsFor(project, selection);
	const failedLayout = groups
		.map((clips) => createGridLayout(
			project.logicalCanvas.width,
			project.logicalCanvas.height,
			frameCountForClips(clips),
			maxTextureSize
		))
		.find((layout) => !layout.ok);

	return failedLayout && !failedLayout.ok
		? [...sizeDiagnostic, diagnostic('atlas-size', 'error', 'exportSettings.maxTextureSize', failedLayout.error)]
		: sizeDiagnostic;
};

const storageDiagnosticsFor = function storageDiagnosticsFor(
	options: ExportDiagnosticsOptions
): readonly ExportDiagnostic[] {
	const report = options.storageReport;

	if (!report) {
		return [diagnostic('storage-quota', 'warning', 'navigator.storage.estimate', 'Browser storage quota is unavailable; the project storage headroom could not be checked.')];
	}

	const requiredBytes = options.requiredStorageBytes ?? 0;

	if (report.availableBytes < requiredBytes) {
		return [diagnostic('storage-quota', 'error', 'navigator.storage.estimate', `Only ${formatByteCount(report.availableBytes)} of browser storage is available, below the ${formatByteCount(requiredBytes)} required by the current asset set.`)];
	}
	if (report.availableBytes < STORAGE_HEADROOM_BYTES) {
		return [diagnostic('storage-quota', 'warning', 'navigator.storage.estimate', `Browser storage has only ${formatByteCount(report.availableBytes)} available. Save or export operations may fail near the quota.`)];
	}

	return [];
};

const memoryDiagnosticsFor = function memoryDiagnosticsFor(
	memory: ExportMemoryEstimate,
	options: ExportDiagnosticsOptions
): readonly ExportDiagnostic[] {
	const limit = options.memoryLimitBytes ?? DEFAULT_EXPORT_MEMORY_LIMIT_BYTES;

	if (!Number.isFinite(limit) || limit <= 0) {
		return [diagnostic('export-memory', 'error', 'export-memory-limit', 'Export memory limit must be a positive finite number.')];
	}
	if (memory.totalBytes > limit) {
		return [diagnostic('export-memory', 'error', 'export-memory', `Estimated export peak is ${formatByteCount(memory.totalBytes)}, above the ${formatByteCount(limit)} safety limit.`)];
	}
	if (memory.totalBytes > limit * 0.75) {
		return [diagnostic('export-memory', 'warning', 'export-memory', `Estimated export peak is ${formatByteCount(memory.totalBytes)}, close to the ${formatByteCount(limit)} safety limit.`)];
	}

	return [];
};

export const createExportDiagnostics = function createExportDiagnostics(
	project: Project,
	selection: ExportClipSelection,
	options: ExportDiagnosticsOptions = {}
): ExportDiagnosticsResult {
	const memory = estimateExportMemory(project, selection);
	const selectionDiagnostics = selection.clipIds.length === 0
		? [diagnostic('atlas-size', 'warning', 'clipIds', 'Select at least one animation clip before exporting.')]
		: [];

	return {
		diagnostics: [
			...selectionDiagnostics,
			...atlasDiagnosticsFor(project, selection),
			...storageDiagnosticsFor(options),
			...memoryDiagnosticsFor(memory, options)
		],
		memory
	};
};
