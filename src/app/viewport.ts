import type { CanvasSize } from '../domain/model.ts';

export type ViewportCameraMode = 'fit' | 'manual';

export type ViewportCamera = Readonly<{
	scale: number;
	offsetX: number;
	offsetY: number;
	mode: ViewportCameraMode;
}>;

export type ViewportPoint = Readonly<{
	x: number;
	y: number;
}>;

export type ViewportMeasurement = Readonly<{
	left?: number;
	top?: number;
	width: number;
	height: number;
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

export type WorldPoint = ViewportPoint;

export const VIEWPORT_SAFE_INSET = 32;
export const MIN_VIEWPORT_SCALE = 0.05;
export const MAX_VIEWPORT_SCALE = 16;
export const VIEWPORT_ZOOM_FACTOR = 1.1;

const finiteOr = function finiteOr(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback;
};

const positiveOr = function positiveOr(value: number, fallback: number): number {
	return Number.isFinite(value) && value > 0 ? value : fallback;
};

const nonNegative = function nonNegative(value: number): number {
	return Math.max(0, finiteOr(value, 0));
};

const safeViewportMeasurement = function safeViewportMeasurement(
	measurement: ViewportMeasurement | undefined
): ViewportRect {
	return {
		left: finiteOr(measurement?.left ?? 0, 0),
		top: finiteOr(measurement?.top ?? 0, 0),
		width: nonNegative(measurement?.width ?? 0),
		height: nonNegative(measurement?.height ?? 0)
	};
};

const safeCanvasSize = function safeCanvasSize(canvas: CanvasSize): CanvasSize {
	return {
		width: nonNegative(canvas.width),
		height: nonNegative(canvas.height)
	};
};

const safePoint = function safePoint(point: ViewportPoint): ViewportPoint {
	return {
		x: finiteOr(point.x, 0),
		y: finiteOr(point.y, 0)
	};
};

const safeInset = function safeInset(value: number): number {
	return nonNegative(value);
};

const clamp = function clamp(value: number, minimum: number, maximum: number): number {
	return Math.min(Math.max(value, minimum), maximum);
};

const clampManualScale = function clampManualScale(value: number): number {
	return clamp(Number.isNaN(value) ? 1 : value, MIN_VIEWPORT_SCALE, MAX_VIEWPORT_SCALE);
};

const cameraMode = function cameraMode(camera: ViewportCamera): ViewportCameraMode {
	return camera.mode === 'fit' ? 'fit' : 'manual';
};

const normalizedCamera = function normalizedCamera(camera: ViewportCamera): ViewportCamera {
	return {
		scale: positiveOr(camera.scale, 1),
		offsetX: finiteOr(camera.offsetX, 0),
		offsetY: finiteOr(camera.offsetY, 0),
		mode: cameraMode(camera)
	};
};

const cameraWith = function cameraWith(
	scale: number,
	offsetX: number,
	offsetY: number,
	mode: ViewportCameraMode
): ViewportCamera {
	return {
		scale: positiveOr(scale, 1),
		offsetX: finiteOr(offsetX, 0),
		offsetY: finiteOr(offsetY, 0),
		mode
	};
};

const centeredAnchor = function centeredAnchor(
	anchor: ViewportPoint,
	viewport: ViewportMeasurement | undefined
): ViewportPoint {
	const safeAnchor = safePoint(anchor);

	if (!viewport) {
		return safeAnchor;
	}

	const safeViewport = safeViewportMeasurement(viewport);

	return {
		x: safeAnchor.x - safeViewport.left - safeViewport.width / 2,
		y: safeAnchor.y - safeViewport.top - safeViewport.height / 2
	};
};

const worldCorners = function worldCorners(bounds: LogicalBounds): readonly WorldPoint[] {
	const x = finiteOr(bounds.x, 0);
	const y = finiteOr(bounds.y, 0);
	const width = finiteOr(bounds.w, 0);
	const height = finiteOr(bounds.h, 0);

	return [
		{ x, y },
		{ x, y: y + height },
		{ x: x + width, y },
		{ x: x + width, y: y + height }
	];
};

const viewportRectangleFromPoints = function viewportRectangleFromPoints(
	points: readonly ViewportPoint[]
): ViewportRectangle {
	const safePoints = points.map(safePoint);
	const xValues = safePoints.map((point) => point.x);
	const yValues = safePoints.map((point) => point.y);
	const left = Math.min(...xValues);
	const top = Math.min(...yValues);

	return {
		left,
		top,
		width: Math.max(...xValues) - left,
		height: Math.max(...yValues) - top
	};
};

export const fittedViewportScale = function fittedViewportScale(
	viewport: ViewportMeasurement | undefined,
	logicalCanvas: CanvasSize,
	inset = VIEWPORT_SAFE_INSET
): number {
	const safeViewport = safeViewportMeasurement(viewport);
	const safeCanvas = safeCanvasSize(logicalCanvas);
	const safeInsetValue = safeInset(inset);
	const availableWidth = Math.max(0, safeViewport.width - safeInsetValue * 2);
	const availableHeight = Math.max(0, safeViewport.height - safeInsetValue * 2);

	if (availableWidth === 0 || availableHeight === 0 || safeCanvas.width === 0 || safeCanvas.height === 0) {
		return 1;
	}

	const scale = Math.min(availableWidth / safeCanvas.width, availableHeight / safeCanvas.height);

	return positiveOr(scale, 1);
};

export const fitViewportCamera = function fitViewportCamera(
	viewport: ViewportMeasurement | undefined,
	logicalCanvas: CanvasSize,
	inset = VIEWPORT_SAFE_INSET
): ViewportCamera {
	return {
		scale: fittedViewportScale(viewport, logicalCanvas, inset),
		offsetX: 0,
		offsetY: 0,
		mode: 'fit'
	};
};

export const actualSizeViewportCamera = function actualSizeViewportCamera(): ViewportCamera {
	return {
		scale: 1,
		offsetX: 0,
		offsetY: 0,
		mode: 'manual'
	};
};

export const panViewportCamera = function panViewportCamera(
	camera: ViewportCamera,
	delta: ViewportPoint
): ViewportCamera {
	const safeCamera = normalizedCamera(camera);
	const safeDelta = safePoint(delta);

	return cameraWith(
		safeCamera.scale,
		safeCamera.offsetX + safeDelta.x,
		safeCamera.offsetY + safeDelta.y,
		'manual'
	);
};

export const setViewportCameraScale = function setViewportCameraScale(
	camera: ViewportCamera,
	scale: number,
	anchor: ViewportPoint,
	viewport?: ViewportMeasurement
): ViewportCamera {
	const safeCamera = normalizedCamera(camera);
	const safeAnchor = centeredAnchor(anchor, viewport);
	const nextScale = clampManualScale(scale);
	const ratio = nextScale / safeCamera.scale;

	return cameraWith(
		nextScale,
		safeAnchor.x - (safeAnchor.x - safeCamera.offsetX) * ratio,
		safeAnchor.y - (safeAnchor.y - safeCamera.offsetY) * ratio,
		'manual'
	);
};

export const zoomViewportCameraByFactor = function zoomViewportCameraByFactor(
	camera: ViewportCamera,
	factor: number,
	anchor: ViewportPoint,
	viewport?: ViewportMeasurement
): ViewportCamera {
	const safeFactor = Number.isNaN(factor) || factor <= 0 ? 1 : factor;

	return setViewportCameraScale(camera, normalizedCamera(camera).scale * safeFactor, anchor, viewport);
};

// With no measurement, anchor is relative to the viewport center. When a
// measurement is supplied, anchor is an absolute screen point.
export const zoomViewportCamera = function zoomViewportCamera(
	camera: ViewportCamera,
	wheelDelta: number,
	anchor: ViewportPoint,
	viewport?: ViewportMeasurement
): ViewportCamera {
	if (!Number.isFinite(wheelDelta) || wheelDelta === 0) {
		return normalizedCamera(camera);
	}

	const factor = wheelDelta < 0 ? VIEWPORT_ZOOM_FACTOR : 1 / VIEWPORT_ZOOM_FACTOR;

	return zoomViewportCameraByFactor(camera, factor, anchor, viewport);
};

export const zoomViewportCameraAtPointer = function zoomViewportCameraAtPointer(
	camera: ViewportCamera,
	wheelDelta: number,
	pointer: ViewportPoint,
	viewport: ViewportMeasurement | undefined
): ViewportCamera {
	return zoomViewportCamera(camera, wheelDelta, pointer, viewport);
};

export const zoomViewportCameraAtCenter = function zoomViewportCameraAtCenter(
	camera: ViewportCamera,
	wheelDelta: number
): ViewportCamera {
	return zoomViewportCamera(camera, wheelDelta, { x: 0, y: 0 });
};

export const resizeViewportCamera = function resizeViewportCamera(
	camera: ViewportCamera,
	viewport: ViewportMeasurement | undefined,
	logicalCanvas: CanvasSize,
	inset = VIEWPORT_SAFE_INSET
): ViewportCamera {
	const safeCamera = normalizedCamera(camera);

	return safeCamera.mode === 'fit'
		? fitViewportCamera(viewport, logicalCanvas, inset)
		: cameraWith(safeCamera.scale, safeCamera.offsetX, safeCamera.offsetY, 'manual');
};

export const worldToScreenPoint = function worldToScreenPoint(
	worldPoint: WorldPoint,
	viewport: ViewportMeasurement | undefined,
	camera: ViewportCamera,
	logicalCanvas: CanvasSize
): ViewportPoint {
	const safeViewport = safeViewportMeasurement(viewport);
	const safeCamera = normalizedCamera(camera);
	const safeCanvas = safeCanvasSize(logicalCanvas);
	const safeWorldPoint = safePoint(worldPoint);

	return {
		x: safeViewport.left + safeViewport.width / 2 + safeCamera.offsetX + (safeWorldPoint.x - safeCanvas.width / 2) * safeCamera.scale,
		y: safeViewport.top + safeViewport.height / 2 + safeCamera.offsetY + (safeWorldPoint.y - safeCanvas.height / 2) * safeCamera.scale
	};
};

export const screenToWorldPoint = function screenToWorldPoint(
	screenPoint: ViewportPoint,
	viewport: ViewportMeasurement | undefined,
	camera: ViewportCamera,
	logicalCanvas: CanvasSize
): WorldPoint {
	const safeViewport = safeViewportMeasurement(viewport);
	const safeCamera = normalizedCamera(camera);
	const safeCanvas = safeCanvasSize(logicalCanvas);
	const safeScreenPoint = safePoint(screenPoint);

	return {
		x: (safeScreenPoint.x - safeViewport.left - safeViewport.width / 2 - safeCamera.offsetX) / safeCamera.scale + safeCanvas.width / 2,
		y: (safeScreenPoint.y - safeViewport.top - safeViewport.height / 2 - safeCamera.offsetY) / safeCamera.scale + safeCanvas.height / 2
	};
};

export const worldBoundsToScreenRectangle = function worldBoundsToScreenRectangle(
	bounds: LogicalBounds,
	viewport: ViewportMeasurement | undefined,
	camera: ViewportCamera,
	logicalCanvas: CanvasSize
): ViewportRectangle {
	return viewportRectangleFromPoints(worldCorners(bounds).map((point) => worldToScreenPoint(point, viewport, camera, logicalCanvas)));
};

export const screenRectangleToWorldBounds = function screenRectangleToWorldBounds(
	start: ViewportPoint,
	end: ViewportPoint,
	viewport: ViewportMeasurement | undefined,
	camera: ViewportCamera,
	logicalCanvas: CanvasSize
): LogicalBounds {
	const safeStart = safePoint(start);
	const safeEnd = safePoint(end);
	const corners = [
		safeStart,
		{ x: safeStart.x, y: safeEnd.y },
		{ x: safeEnd.x, y: safeStart.y },
		safeEnd
	].map((point) => screenToWorldPoint(point, viewport, camera, logicalCanvas));
	const xValues = corners.map((point) => point.x);
	const yValues = corners.map((point) => point.y);
	const x = Math.min(...xValues);
	const y = Math.min(...yValues);

	return {
		x,
		y,
		w: Math.max(...xValues) - x,
		h: Math.max(...yValues) - y
	};
};

export const normalizeViewportRectangle = function normalizeViewportRectangle(
	start: ViewportPoint,
	end: ViewportPoint
): ViewportRectangle {
	const safeStart = safePoint(start);
	const safeEnd = safePoint(end);

	return {
		left: Math.min(safeStart.x, safeEnd.x),
		top: Math.min(safeStart.y, safeEnd.y),
		width: Math.abs(safeEnd.x - safeStart.x),
		height: Math.abs(safeEnd.y - safeStart.y)
	};
};

export const formatViewportScale = function formatViewportScale(scale: number): string {
	return `${Math.round(positiveOr(scale, 1) * 100)}%`;
};

export const formatViewportCoordinate = function formatViewportCoordinate(point: ViewportPoint | undefined): string {
	return point
		? `X ${Math.round(finiteOr(point.x, 0))} · Y ${Math.round(finiteOr(point.y, 0))}`
		: 'X — · Y —';
};
