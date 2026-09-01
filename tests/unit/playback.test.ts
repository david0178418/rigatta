import { describe, expect, test } from 'bun:test';
import {
	advancePlayback,
	createPlaybackState,
	frameCountForClip,
	frameTimeSeconds,
	seekPlayback,
	stepPlayback,
	togglePlayback
} from '../../src/domain/playback.ts';
import { updateClipPlayback } from '../../src/domain/animation.ts';
import type { Clip, Project } from '../../src/domain/model.ts';
import type { OperationResult } from '../../src/domain/operations.ts';
import { createRigProject } from '../fixtures.ts';

const clipId = '123e4567-e89b-42d3-a456-426614174010';

const unwrap = function unwrap<TValue>(result: OperationResult<TValue>): TValue {
	if (!result.ok) {
		throw new Error(result.error.message);
	}

	return result.value;
};

const withClip = function withClip(): Project {
	const project = createRigProject();

	return {
		...project,
		clips: [{
			id: clipId,
			name: 'walk',
			durationSeconds: 1,
			fps: 12,
			loop: true,
			tracks: [],
			events: []
		}] satisfies readonly Clip[]
	};
};

const clipFrom = function clipFrom(project: Project): Clip {
	const clip = project.clips[0];

	if (!clip) {
		throw new Error('The playback fixture has no clip.');
	}

	return clip;
};

describe('frame-accurate playback', () => {
	test('accumulates sub-frame time without drifting between frame boundaries', () => {
		const clip = clipFrom(withClip());
		const playing = togglePlayback(createPlaybackState(), clip);
		const halfFrame = advancePlayback(playing, clip, 1 / 24);
		const nextFrame = advancePlayback(halfFrame, clip, 1 / 24);

		expect(frameCountForClip(clip)).toBe(12);
		expect(halfFrame.frameIndex).toBe(0);
		expect(nextFrame.frameIndex).toBe(1);
		expect(frameTimeSeconds(nextFrame, clip)).toBeCloseTo(1 / 12);
	});

	test('steps in both directions and wraps looped clips', () => {
		const clip = clipFrom(withClip());
		const first = stepPlayback(createPlaybackState(), clip, 1);
		const last = seekPlayback(first, clip, frameCountForClip(clip) - 1);
		const wrapped = stepPlayback(last, clip, 1);
		const backward = stepPlayback(createPlaybackState(), clip, -1);

		expect(first.frameIndex).toBe(1);
		expect(wrapped.frameIndex).toBe(0);
		expect(backward.frameIndex).toBe(11);
		expect(wrapped.playing).toBe(false);
	});

	test('pauses at the last frame for non-looping clips and restarts explicitly', () => {
		const project = withClip();
		const nonLooping = clipFrom(unwrap(updateClipPlayback(project, clipId, { loop: false })));
		const playing = togglePlayback(createPlaybackState(), nonLooping);
		const finished = advancePlayback(playing, nonLooping, nonLooping.durationSeconds);
		const restarted = togglePlayback(finished, nonLooping);

		expect(finished.frameIndex).toBe(frameCountForClip(nonLooping) - 1);
		expect(finished.playing).toBe(false);
		expect(restarted.frameIndex).toBe(0);
		expect(restarted.playing).toBe(true);
	});
});
