import { describe, expect, test } from 'bun:test';
import { createViewportState, formatViewportZoom, panViewport, resetViewport, screenToLogicalPoint, zoomViewport, type ViewportState } from '../../src/app/viewport.ts';

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

	test('maps a screen drop through pan and zoom into logical coordinates', () => {
		const point = screenToLogicalPoint(
			{ x: 650, y: 350 },
			{ left: 100, top: 100, width: 600, height: 600 },
			{ zoom: 2, offsetX: 20, offsetY: -10 },
			{ width: 1024, height: 512 }
		);

		expect(point).toEqual({ x: 627, y: 236 });
	});
});
