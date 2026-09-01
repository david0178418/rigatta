import { describe, expect, test } from 'bun:test';
import { addNumberKey, createClip, createTrack } from '../../src/domain/animation.ts';
import { buildTimelineTrackRows } from '../../src/app/timeline.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import type { Project } from '../../src/domain/model.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174030';
const trackId = '123e4567-e89b-42d3-a456-426614174031';
const keyId = '123e4567-e89b-42d3-a456-426614174032';

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const animatedProject = function animatedProject(): Project {
	const withClip = unwrap(createClip(createRigProject(), { name: 'walk', durationSeconds: 2, fps: 12 }, () => clipId));
	const withTrack = unwrap(createTrack(withClip, clipId, {
		kind: 'bone-transform',
		targetId: fixtureIds.root,
		property: 'x'
	}, () => trackId));

	return unwrap(addNumberKey(withTrack, clipId, trackId, { timeSeconds: 0.5, value: 20 }, () => keyId));
};

describe('dopesheet track rows', () => {
	test('builds labeled rows with frame-snapped key markers', () => {
		const project = animatedProject();
		const clip = project.clips[0];

		if (!clip) {
			throw new Error('The dopesheet fixture has no clip.');
		}

		const rows = buildTimelineTrackRows(project, clip);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.label).toBe('Bone transform · x · root');
		expect(rows[0]?.keys).toEqual([{ id: keyId, frameIndex: 6 }]);
	});

	test('filters rows by typed label without changing the clip', () => {
		const project = animatedProject();
		const clip = project.clips[0];

		if (!clip) {
			throw new Error('The dopesheet fixture has no clip.');
		}

		expect(buildTimelineTrackRows(project, clip, 'ROOT')).toHaveLength(1);
		expect(buildTimelineTrackRows(project, clip, 'opacity')).toHaveLength(0);
		expect(project.clips[0]).toEqual(clip);
	});
});
