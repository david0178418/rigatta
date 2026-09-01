import type { CanvasSize } from '../domain/model.ts';

export type ViewportState = Readonly<{
	zoom: number;
	offsetX: number;
	offsetY: number;
}>;

export type ViewportPoint = Readonly<{
	x: number;
	y: number;
}>;

export type ViewportRect = Readonly<{
	left: number;
	top: number;
	width: number;
	height: number;
}>;

export type ViewportRectangle = Readonly<{
	left: number;
	top: number;
	width: number;
	height: number;
}>;

export type LogicalBounds = Readonly<{
	x: number;
	y: number;
	w: number;
	h: number;
}>;

export const MIN_VIEWPORT_ZOOM = 0.25;
export const MAX_VIEWPORT_ZOOM = 4;

const clamp = function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
};

export const createViewportState = function createViewportState(): ViewportState {
	return { zoom: 1, offsetX: 0, offsetY: 0 };
};

export const panViewport = function panViewport(
	viewport: ViewportState,
	delta: ViewportPoint
): ViewportState {
	return {
		...viewport,
		offsetX: viewport.offsetX + delta.x,
		offsetY: viewport.offsetY + delta.y
	};
};

export const zoomViewport = function zoomViewport(
	viewport: ViewportState,
	wheelDelta: number,
	anchor: ViewportPoint
): ViewportState {
	if (!Number.isFinite(wheelDelta) || wheelDelta === 0) {
		return viewport;
	}

	const factor = wheelDelta < 0 ? 1.1 : 0.9;
	const zoom = clamp(viewport.zoom * factor, MIN_VIEWPORT_ZOOM, MAX_VIEWPORT_ZOOM);

	if (zoom === viewport.zoom) {
		return viewport;
	}

	const scale = zoom / viewport.zoom;

	return {
		zoom,
		offsetX: anchor.x - (anchor.x - viewport.offsetX) * scale,
		offsetY: anchor.y - (anchor.y - viewport.offsetY) * scale
	};
};

export const resetViewport = function resetViewport(): ViewportState {
	return createViewportState();
};

export const screenToLogicalPoint = function screenToLogicalPoint(
	screenPoint: ViewportPoint,
	stage: ViewportRect,
	viewport: ViewportState,
	logicalCanvas: CanvasSize
): ViewportPoint {
	const centeredX = screenPoint.x - stage.left - stage.width / 2;
	const centeredY = screenPoint.y - stage.top - stage.height / 2;

	return {
		x: (centeredX - viewport.offsetX) / viewport.zoom + logicalCanvas.width / 2,
		y: (centeredY - viewport.offsetY) / viewport.zoom + logicalCanvas.height / 2
	};
};

export const normalizeViewportRectangle = function normalizeViewportRectangle(
	start: ViewportPoint,
	end: ViewportPoint
): ViewportRectangle {
	return {
		left: Math.min(start.x, end.x),
		top: Math.min(start.y, end.y),
		width: Math.abs(end.x - start.x),
		height: Math.abs(end.y - start.y)
	};
};

export const screenRectangleToLogicalBounds = function screenRectangleToLogicalBounds(
	start: ViewportPoint,
	end: ViewportPoint,
	stage: ViewportRect,
	viewport: ViewportState,
	logicalCanvas: CanvasSize
): LogicalBounds {
	const corners = [
		start,
		{ x: start.x, y: end.y },
		{ x: end.x, y: start.y },
		end
	].map((point) => screenToLogicalPoint(point, stage, viewport, logicalCanvas));
	const xValues = corners.map((point) => point.x);
	const yValues = corners.map((point) => point.y);
	const left = Math.min(...xValues);
	const top = Math.min(...yValues);

	return {
		x: left,
		y: top,
		w: Math.max(...xValues) - left,
		h: Math.max(...yValues) - top
	};
};

export const formatViewportZoom = function formatViewportZoom(zoom: number): string {
	return `${Math.round(zoom * 100)}%`;
};
