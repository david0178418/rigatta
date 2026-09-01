import { describe, expect, test } from 'bun:test';
import { createClip } from '../../src/domain/animation.ts';
import { createExportDiagnostics, estimateExportMemory } from '../../src/export/diagnostics.ts';
import { createExportClipSelection } from '../../src/export/selection.ts';
import type { Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import type { StorageReport } from '../../src/persistence/storage.ts';
import { createRigProject } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-4266141740a0';

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const projectWithClip = function projectWithClip(overrides: Partial<Project['exportSettings']> = {}): Project {
	const project = unwrap(createClip(createRigProject(), { name: 'walk' }, () => clipId));

	return {
		...project,
		exportSettings: { ...project.exportSettings, ...overrides }
	};
};

const storageReport = function storageReport(availableBytes: number): StorageReport {
	return {
		usageBytes: 1000,
		quotaBytes: 1000 + availableBytes,
		availableBytes,
		usageRatio: 1000 / (1000 + availableBytes)
	};
};

describe('export preflight diagnostics', () => {
	test('estimates sampled frames, atlas memory, and metadata together', () => {
		const project = projectWithClip({ mode: 'packed', maxTextureSize: 128 });
		const selection = createExportClipSelection(project);
		const estimate = estimateExportMemory(project, selection);

		expect(estimate.frameCount).toBe(12);
		expect(estimate.sampledFrameBytes).toBe(12 * 1024 * 1024 * 4);
		expect(estimate.atlasBytes).toBe(128 * 128 * 4);
		expect(estimate.totalBytes).toBe(estimate.sampledFrameBytes + estimate.atlasBytes + estimate.metadataBytes);
	});

	test('reports grid atlas limits before export work begins', () => {
		const project = projectWithClip({ maxTextureSize: 512 });
		const selection = createExportClipSelection(project);
		const result = createExportDiagnostics(project, selection, {
			storageReport: storageReport(64 * 1024 * 1024),
			memoryLimitBytes: 1024 * 1024 * 1024
		});

		expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'atlas-size', severity: 'error' }));
	});

	test('reports low storage headroom and export memory pressure', () => {
		const project = projectWithClip({ mode: 'packed', maxTextureSize: 128 });
		const selection = createExportClipSelection(project);
		const result = createExportDiagnostics(project, selection, {
			storageReport: storageReport(8 * 1024 * 1024),
			requiredStorageBytes: 16 * 1024 * 1024,
			memoryLimitBytes: 1024
		});
		const codes = result.diagnostics.map(({ code }) => code);

		expect(codes).toContain('storage-quota');
		expect(codes).toContain('export-memory');
		expect(result.diagnostics.every(({ severity }) => severity === 'error')).toBe(true);
	});
});
