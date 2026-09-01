import { describe, expect, test } from 'bun:test';
import {
	availableTrackDefinitions,
	createTimelineViewport,
	panTimeline,
	timelineFrameRange,
	visibleFrameCount,
	zoomTimeline
} from '../../src/app/timeline.ts';
import { createClip } from '../../src/domain/animation.ts';
import { createRigProject } from '../fixtures.ts';

describe('timeline navigation', () => {
	test('shows a bounded integer frame range at the default scale', () => {
		const viewport = createTimelineViewport();

		expect(visibleFrameCount(viewport, 36)).toBe(20);
		expect(timelineFrameRange(viewport, 36)).toEqual({ startFrame: 0, endFrame: 19 });
	});

	test('zooms around the active frame and keeps the result in range', () => {
		const viewport = zoomTimeline(createTimelineViewport(), 1, 10, 36);

		expect(viewport.pixelsPerFrame).toBe(40);
		expect(viewport.startFrame).toBe(2);
		expect(timelineFrameRange(viewport, 36)).toEqual({ startFrame: 2, endFrame: 17 });
	});

	test('pans by visible pixels and clamps both edges', () => {
		const zoomed = zoomTimeline(createTimelineViewport(), 1, 10, 36);
		const later = panTimeline(zoomed, -320, 36);
		const first = panTimeline(later, 9999, 36);
		const last = panTimeline(first, -9999, 36);

		expect(later.startFrame).toBe(10);
		expect(first.startFrame).toBe(0);
		expect(last.startFrame).toBe(20);
	});

	test('offers transform and enabled tracks for gameplay attachments', () => {
		const projectResult = createClip(createRigProject(), { name: 'walk' }, () => '123e4567-e89b-42d3-a456-426614174060');

		expect(projectResult.ok).toBe(true);
		if (!projectResult.ok) {
			return;
		}

		const clip = projectResult.value.clips[0];

		if (!clip) {
			throw new Error('The fixture clip is unavailable.');
		}

		const labels = availableTrackDefinitions(projectResult.value, clip).map((candidate) => candidate.label);

		expect(labels).toContain('muzzle · Point · x');
		expect(labels).toContain('muzzle · Point · enabled');
		expect(labels).toContain('hitbox · Rectangle · rotation');
		expect(labels).toContain('hitbox · Rectangle · width');
		expect(labels).toContain('hitbox · Rectangle · enabled');
	});
});
