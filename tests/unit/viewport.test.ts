import { describe, expect, test } from 'bun:test';
import {
	actualSizeViewportCamera,
	fitViewportCamera,
	fittedViewportScale,
	formatViewportCoordinate,
	formatViewportScale,
	MAX_VIEWPORT_SCALE,
	MIN_VIEWPORT_SCALE,
	normalizeViewportRectangle,
	panViewportCamera,
	resizeViewportCamera,
	screenRectangleToWorldBounds,
	screenToWorldPoint,
	setViewportCameraScale,
	VIEWPORT_SAFE_INSET,
	worldBoundsToScreenRectangle,
	worldToScreenPoint,
	zoomViewportCameraAtPointer,
	type ViewportCamera,
	type ViewportMeasurement,
	type ViewportPoint
} from '../../src/app/viewport.ts';

const canvasSizes = [
	{ name: 'square', size: { width: 400, height: 400 } },
	{ name: 'non-square', size: { width: 800, height: 400 } }
] as const;

describe('viewport camera model', () => {
	const fitCases = [
		{
			name: 'square canvas in a square viewport',
			viewport: { width: 1000, height: 1000 },
			canvas: { width: 400, height: 400 },
			expectedScale: (1000 - VIEWPORT_SAFE_INSET * 2) / 400
		},
		{
			name: 'wide canvas in a narrow viewport',
			viewport: { width: 500, height: 900 },
			canvas: { width: 800, height: 400 },
			expectedScale: (500 - VIEWPORT_SAFE_INSET * 2) / 800
		},
		{
			name: 'wide viewport around a square canvas',
			viewport: { width: 1400, height: 500 },
			canvas: { width: 400, height: 400 },
			expectedScale: (500 - VIEWPORT_SAFE_INSET * 2) / 400
		}
	] as const;

	fitCases.forEach(({ name, viewport, canvas, expectedScale }) => {
		test(`fits ${name} inside the safe inset`, () => {
			expect(fittedViewportScale(viewport, canvas)).toBeCloseTo(expectedScale);
			expect(fitViewportCamera(viewport, canvas)).toEqual({
				scale: expectedScale,
				offsetX: 0,
				offsetY: 0,
				mode: 'fit'
			});
		});
	});

	test('uses a finite fallback for zero and unmounted measurements', () => {
		const canvas = { width: 800, height: 400 };
		const camera = fitViewportCamera({ width: 0, height: 0 }, canvas);
		const point = screenToWorldPoint(
			{ x: 0, y: 0 },
			{ width: 0, height: 0 },
			camera,
			canvas
		);

		expect(camera).toEqual({ scale: 1, offsetX: 0, offsetY: 0, mode: 'fit' });
		expect(point).toEqual({ x: 400, y: 200 });
		expect(fitViewportCamera(undefined, canvas).scale).toBe(1);
	});

	test('actual size centers a top-left-origin canvas at one-to-one scale', () => {
		expect(actualSizeViewportCamera()).toEqual({
			scale: 1,
			offsetX: 0,
			offsetY: 0,
			mode: 'manual'
		});

		expect(worldToScreenPoint(
			{ x: 0, y: 0 },
			{ left: 100, top: 40, width: 800, height: 600 },
			actualSizeViewportCamera(),
			{ width: 400, height: 200 }
		)).toEqual({ x: 300, y: 240 });
	});

	test('panning creates a manual camera and preserves negative offsets', () => {
		const camera = panViewportCamera(
			fitViewportCamera({ width: 900, height: 600 }, { width: 400, height: 300 }),
			{ x: -125, y: 48 }
		);

		expect(camera.scale).toBeCloseTo(1.7866666666666666);
		expect(camera.offsetX).toBe(-125);
		expect(camera.offsetY).toBe(48);
		expect(camera.mode).toBe('manual');
	});

	test('pointer-anchored zoom keeps the world point under the anchor fixed', () => {
		const viewport: ViewportMeasurement = { left: 20, top: 30, width: 1000, height: 700 };
		const canvas = { width: 800, height: 400 };
		const camera: ViewportCamera = {
			scale: 2,
			offsetX: -80,
			offsetY: 35,
			mode: 'manual'
		};
		const anchor: ViewportPoint = { x: (viewport.left ?? 0) + viewport.width / 2 + 125, y: (viewport.top ?? 0) + viewport.height / 2 - 90 };
		const before = screenToWorldPoint(anchor, viewport, camera, canvas);
		const afterCamera = zoomViewportCameraAtPointer(camera, -1, anchor, viewport);
		const after = screenToWorldPoint(anchor, viewport, afterCamera, canvas);

		expect(afterCamera.scale).toBeCloseTo(2.2);
		expect(afterCamera.mode).toBe('manual');
		expect(after.x).toBeCloseTo(before.x);
		expect(after.y).toBeCloseTo(before.y);
	});

	test('clamps both manual zoom limits at 5% and 1600%', () => {
		const camera: ViewportCamera = {
			scale: 1,
			offsetX: 24,
			offsetY: -12,
			mode: 'fit'
		};

		expect(setViewportCameraScale(camera, 0, { x: 100, y: 50 }).scale).toBe(MIN_VIEWPORT_SCALE);
		expect(setViewportCameraScale(camera, 100, { x: 100, y: 50 }).scale).toBe(MAX_VIEWPORT_SCALE);
		expect(setViewportCameraScale(camera, Number.NEGATIVE_INFINITY, { x: 100, y: 50 }).scale).toBe(MIN_VIEWPORT_SCALE);
		expect(setViewportCameraScale(camera, Number.POSITIVE_INFINITY, { x: 100, y: 50 }).scale).toBe(MAX_VIEWPORT_SCALE);
		expect(setViewportCameraScale(camera, Number.NaN, { x: 100, y: 50 }).scale).toBe(1);
	});

	test('fit resize refits while manual resize preserves the centered world point', () => {
		const canvas = { width: 600, height: 300 };
		const firstViewport = { width: 1000, height: 700 };
		const nextViewport = { width: 700, height: 1000 };
		const fitCamera = fitViewportCamera(firstViewport, canvas);
		const resizedFit = resizeViewportCamera(fitCamera, nextViewport, canvas);
		const manualCamera = panViewportCamera(fitCamera, { x: -90, y: 42 });
		const resizedManual = resizeViewportCamera(manualCamera, nextViewport, canvas);
		const firstCenter = screenToWorldPoint(
			{ x: firstViewport.width / 2, y: firstViewport.height / 2 },
			firstViewport,
			manualCamera,
			canvas
		);
		const nextCenter = screenToWorldPoint(
			{ x: nextViewport.width / 2, y: nextViewport.height / 2 },
			nextViewport,
			resizedManual,
			canvas
		);

		expect(resizedFit.mode).toBe('fit');
		expect(resizedFit.scale).not.toBe(fitCamera.scale);
		expect(resizedManual).toEqual(manualCamera);
		expect(nextCenter.x).toBeCloseTo(firstCenter.x);
		expect(nextCenter.y).toBeCloseTo(firstCenter.y);
	});

	canvasSizes.forEach(({ name, size }, index) => {
		test(`round-trips ${name} world points with negative offsets`, () => {
			const viewport = { left: 80 + index * 11, top: 40 - index * 7, width: 900, height: 620 };
			const camera: ViewportCamera = {
				scale: 1.35 + index * 0.25,
				offsetX: -73 - index * 10,
				offsetY: 28 + index * 6,
				mode: 'manual'
			};
			const world: ViewportPoint = { x: 17 + index * 23, y: 33 + index * 19 };
			const screen = worldToScreenPoint(world, viewport, camera, size);
			const roundTrip = screenToWorldPoint(screen, viewport, camera, size);

			expect(roundTrip.x).toBeCloseTo(world.x);
			expect(roundTrip.y).toBeCloseTo(world.y);
		});
	});

	test('converts rectangles in both directions using the same camera mapping', () => {
		const viewport = { left: 10, top: 20, width: 800, height: 600 };
		const canvas = { width: 400, height: 200 };
		const camera: ViewportCamera = { scale: 2, offsetX: -30, offsetY: 45, mode: 'manual' };
		const bounds = { x: -20, y: 30, w: 140, h: 80 };
		const screenRectangle = worldBoundsToScreenRectangle(bounds, viewport, camera, canvas);
		const roundTrip = screenRectangleToWorldBounds(
			{ x: screenRectangle.left, y: screenRectangle.top },
			{ x: screenRectangle.left + screenRectangle.width, y: screenRectangle.top + screenRectangle.height },
			viewport,
			camera,
			canvas
		);

		expect(screenRectangle).toEqual({ left: -60, top: 225, width: 280, height: 160 });
		expect(roundTrip).toEqual(bounds);
		expect(normalizeViewportRectangle(
			{ x: screenRectangle.left + screenRectangle.width, y: screenRectangle.top + screenRectangle.height },
			{ x: screenRectangle.left, y: screenRectangle.top }
		)).toEqual(screenRectangle);
	});

	test('formats scale and coordinates without unstable fractional output', () => {
		expect(formatViewportScale(1.596)).toBe('160%');
		expect(formatViewportScale(Number.NaN)).toBe('100%');
		expect(formatViewportCoordinate(undefined)).toBe('X — · Y —');
		expect(formatViewportCoordinate({ x: 12.6, y: -4.4 })).toBe('X 13 · Y -4');
	});
});
