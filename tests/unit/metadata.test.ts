import { describe, expect, test } from 'bun:test';
import { addEvent, createClip } from '../../src/domain/animation.ts';
import { createCompanionMetadata } from '../../src/export/metadata.ts';
import { sampleClipFrames } from '../../src/export/sampling.ts';
import type { Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createRigProject, fixtureIds } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174090';
const eventId = '123e4567-e89b-42d3-a456-426614174091';

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const projectWithEvent = function projectWithEvent(): Project {
	const withClip = unwrap(createClip(createRigProject(), { name: 'walk' }, () => clipId));

	return unwrap(addEvent(withClip, clipId, {
		timeSeconds: 0.5,
		name: 'impact',
		payload: { damage: 4 }
	}, () => eventId));
};

describe('companion gameplay metadata', () => {
	test('maps sampled gameplay data and boundary events to frame records', () => {
		const project = projectWithEvent();
		const clip = project.clips[0];

		if (!clip) {
			throw new Error('The fixture clip is unavailable.');
		}

		const sampled = sampleClipFrames(project, clipId);
		const result = createCompanionMetadata(project, [{
			clip,
			frames: sampled.frames,
			frameKeys: sampled.frames.map((frame) => `walk/frame-${String(frame.index).padStart(4, '0')}`),
			atlasPages: sampled.frames.map(() => 0)
		}]);

		if (!result.ok) {
			throw new Error(result.error);
		}

		const metadataClip = result.value.clips.walk;
		const eventFrame = metadataClip?.frames[6];
		const point = eventFrame?.points[fixtureIds.point];
		const rectangle = eventFrame?.rectangles[fixtureIds.rectangle];

		expect(metadataClip?.frames).toHaveLength(12);
		expect(eventFrame?.events).toEqual([{ id: eventId, name: 'impact', payload: { damage: 4 } }]);
		expect(point).toMatchObject({ enabled: true });
		expect(rectangle).toMatchObject({ width: 20, height: 30, enabled: true });
	});

	test('rejects duplicate frame keys and mismatched sample arrays', () => {
		const project = projectWithEvent();
		const clip = project.clips[0];

		if (!clip) {
			throw new Error('The fixture clip is unavailable.');
		}

		const sampled = sampleClipFrames(project, clipId);
		const input = {
			clip,
			frames: sampled.frames,
			frameKeys: sampled.frames.map(() => 'same'),
			atlasPages: sampled.frames.map(() => 0)
		};

		expect(createCompanionMetadata(project, [input])).toMatchObject({ ok: false });
		expect(createCompanionMetadata(project, [{ ...input, frameKeys: [] }])).toMatchObject({ ok: false });
	});
});
