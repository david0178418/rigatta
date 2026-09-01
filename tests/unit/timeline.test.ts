import { describe, expect, test } from 'bun:test';
import {
	createTimelineViewport,
	panTimeline,
	timelineFrameRange,
	visibleFrameCount,
	zoomTimeline
} from '../../src/app/timeline.ts';

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
});
