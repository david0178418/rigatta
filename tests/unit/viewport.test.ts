import { describe, expect, test } from 'bun:test';
import { createViewportState, formatViewportZoom, panViewport, resetViewport, zoomViewport, type ViewportState } from '../../src/app/viewport.ts';

describe('viewport navigation state', () => {
	test('pans without changing zoom', () => {
		const viewport = panViewport(createViewportState(), { x: 24, y: -12 });

		expect(viewport).toEqual({ zoom: 1, offsetX: 24, offsetY: -12 });
	});

	test('zooms around the pointer anchor', () => {
		const viewport = zoomViewport(createViewportState(), -1, { x: 100, y: -50 });

		expect(viewport.zoom).toBeCloseTo(1.1);
		expect(viewport.offsetX).toBeCloseTo(-10);
		expect(viewport.offsetY).toBeCloseTo(5);
	});

	test('clamps zoom and resets the view', () => {
		const zoomed = Array.from({ length: 40 }).reduce<ViewportState>(
			(current) => zoomViewport(current, -1, { x: 0, y: 0 }),
			createViewportState()
		);

		expect(zoomed.zoom).toBe(4);
		expect(formatViewportZoom(zoomed.zoom)).toBe('400%');
		expect(resetViewport()).toEqual({ zoom: 1, offsetX: 0, offsetY: 0 });
	});
});
