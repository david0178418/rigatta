export type ViewportState = Readonly<{
	zoom: number;
	offsetX: number;
	offsetY: number;
}>;

export type ViewportPoint = Readonly<{
	x: number;
	y: number;
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

export const formatViewportZoom = function formatViewportZoom(zoom: number): string {
	return `${Math.round(zoom * 100)}%`;
};
