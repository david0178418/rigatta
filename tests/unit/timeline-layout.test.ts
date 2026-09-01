import { describe, expect, test } from 'bun:test';
import {
	ANIMATE_TIMELINE_DEFAULT_HEIGHT,
	clampTimelineHeight,
	timelineHeightBounds,
	timelineHeightFromKeyboard,
	timelineHeightFromPointer
} from '../../src/app/timeline-layout.ts';

const supportedHeights = [720, 800, 900, 1080] as const;

describe('timeline layout sizing', () => {
	test('derives bounded defaults for every supported viewport height', () => {
		expect(supportedHeights.map((height) => timelineHeightBounds(height))).toEqual([
			{ min: 190, max: 396, defaultHeight: 260 },
			{ min: 190, max: 440, defaultHeight: 260 },
			{ min: 190, max: 495, defaultHeight: 260 },
			{ min: 190, max: 594, defaultHeight: 260 }
		]);
	});

	test('clamps direct and pointer-driven heights to the bounds', () => {
		supportedHeights.forEach((viewportHeight) => {
			const bounds = timelineHeightBounds(viewportHeight);

			expect(clampTimelineHeight(bounds.min - 1, viewportHeight)).toBe(bounds.min);
			expect(clampTimelineHeight(bounds.max + 1, viewportHeight)).toBe(bounds.max);
			expect(timelineHeightFromPointer(ANIMATE_TIMELINE_DEFAULT_HEIGHT, 400, -1000, viewportHeight)).toBe(bounds.max);
			expect(timelineHeightFromPointer(ANIMATE_TIMELINE_DEFAULT_HEIGHT, 400, 1000, viewportHeight)).toBe(bounds.min);
		});
	});

	test('supports splitter keyboard increments and endpoints', () => {
		expect(timelineHeightFromKeyboard(260, 'ArrowUp', 720)).toBe(276);
		expect(timelineHeightFromKeyboard(260, 'ArrowDown', 720)).toBe(244);
		expect(timelineHeightFromKeyboard(260, 'Home', 720)).toBe(190);
		expect(timelineHeightFromKeyboard(260, 'End', 720)).toBe(396);
		expect(timelineHeightFromKeyboard(190, 'ArrowDown', 720)).toBe(190);
		expect(timelineHeightFromKeyboard(396, 'ArrowUp', 720)).toBe(396);
		expect(timelineHeightFromKeyboard(260, 'PageUp', 720)).toBeUndefined();
	});
});
