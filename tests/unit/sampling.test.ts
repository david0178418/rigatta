import { describe, expect, test } from 'bun:test';
import { createClip } from '../../src/domain/animation.ts';
import { sampleClipFrames } from '../../src/export/sampling.ts';
import type { Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174070';

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const projectWithClip = function projectWithClip(): Project {
	return unwrap(createClip(createRigProject(), { name: 'walk' }, () => clipId));
};

describe('deterministic clip sampling', () => {
	test('samples one pose and gameplay frame for each frame index', () => {
		const result = sampleClipFrames(projectWithClip(), clipId);

		expect(result.diagnostics).toEqual([]);
		expect(result.frames).toHaveLength(12);
		expect(result.frames.map((frame) => frame.index)).toEqual([...Array(12).keys()]);
		expect(result.frames.map((frame) => frame.timeSeconds)).toEqual(
			[...Array(12).keys()].map((index) => index / 12)
		);
		expect(result.frames[0]?.pose.clipId).toBe(clipId);
		expect(result.frames[0]?.gameplay.points[0]?.id).toBe(fixtureIds.point);
	});

	test('returns byte-stable data for repeated sampling', () => {
		const project = projectWithClip();

		expect(sampleClipFrames(project, clipId)).toEqual(sampleClipFrames(project, clipId));
	});

	test('rejects missing clips before producing frames', () => {
		const result = sampleClipFrames(projectWithClip(), '123e4567-e89b-42d3-a456-426614174099');

		expect(result.frames).toEqual([]);
		expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'missing-clip' }));
	});
});
