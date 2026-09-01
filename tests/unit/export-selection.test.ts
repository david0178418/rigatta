import { describe, expect, test } from 'bun:test';
import {
	clipIdsForProject,
	createExportClipSelection,
	normalizeExportClipIds,
	setExportOutputMode,
	toggleExportClip
} from '../../src/export/selection.ts';
import { createClip } from '../../src/domain/animation.ts';
import type { Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createRigProject } from '../fixtures.ts';

const clipIds = [
	'123e4567-e89b-42d3-a456-426614174060',
	'123e4567-e89b-42d3-a456-426614174061'
] as const;

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const projectWithClips = function projectWithClips(): Project {
	const first = unwrap(createClip(createRigProject(), { name: 'walk' }, () => clipIds[0]));

	return unwrap(createClip(first, { name: 'run' }, () => clipIds[1]));
};

describe('export clip selection', () => {
	test('selects all valid clips in project order', () => {
		const project = projectWithClips();
		const selection = createExportClipSelection(project);

		expect(clipIdsForProject(project)).toEqual([...clipIds]);
		expect(selection).toEqual({ mode: 'combined', clipIds: [...clipIds] });
		expect(normalizeExportClipIds(project, [clipIds[1], clipIds[0], clipIds[0]])).toEqual([...clipIds]);
	});

	test('toggles clips without admitting invalid IDs and preserves output mode', () => {
		const project = projectWithClips();
		const initial = setExportOutputMode(createExportClipSelection(project), 'per-clip');
		const withoutFirst = toggleExportClip(project, initial, clipIds[0]);
		const withoutBoth = toggleExportClip(project, withoutFirst, clipIds[1]);
		const restored = toggleExportClip(project, withoutBoth, clipIds[0]);
		const invalid = toggleExportClip(project, restored, '123e4567-e89b-42d3-a456-426614174099');

		expect(withoutFirst).toEqual({ mode: 'per-clip', clipIds: [clipIds[1]] });
		expect(withoutBoth.clipIds).toEqual([]);
		expect(restored.clipIds).toEqual([clipIds[0]]);
		expect(invalid).toEqual(restored);
	});
});
