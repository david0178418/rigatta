import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type WheelEvent as ReactWheelEvent } from 'react';
import type { Project } from '../domain/model.ts';
import type { EntityId } from '../domain/ids.ts';
import type { EvaluatedPose } from '../domain/pose.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import { createEditorViewportRenderer, type EditorViewportRenderer } from '../rendering/editor-viewport.ts';
import {
	actualSizeViewportCamera,
	fitViewportCamera,
	formatViewportCoordinate,
	formatViewportScale,
	normalizeViewportRectangle,
	panViewportCamera,
	resizeViewportCamera,
	screenRectangleToWorldBounds,
	screenToWorldPoint,
	worldToScreenPoint,
	zoomViewportCameraAtCenter,
	zoomViewportCameraAtPointer,
	type LogicalBounds,
	type ViewportCamera,
	type ViewportMeasurement,
	type ViewportPoint,
	type ViewportRectangle
} from './viewport.ts';
import { DEFAULT_GRID_SETTINGS, snapPointToGrid } from './grid.ts';
import type { Selection } from './selection.ts';
import { canvasGestureModeFor, type CanvasGestureMode, type TransformModifiers, type TransformPhase, type TransformTool } from './transform-gesture.ts';
import { isShortcutTypingTarget } from './shortcuts.ts';
import { Tooltip } from './ui-primitives.tsx';

type PointerSession = Readonly<{
	id: number;
	x: number;
	y: number;
	startX: number;
	startY: number;
	mode: CanvasGestureMode;
	constrained: boolean;
	additive: boolean;
}>;

type ViewportGestureMode = CanvasGestureMode | 'idle';

type RenderRequest = Readonly<{
	id: number;
	renderer: EditorViewportRenderer;
	project: Project;
	assets: ProjectAssetBlobs;
	pose: EvaluatedPose | undefined;
	gridVisible: boolean | undefined;
	gridSpacing: number | undefined;
	hiddenIds: ReadonlySet<EntityId>;
	selectedIds: readonly EntityId[];
	transformTool: TransformTool | undefined;
}>;

const devicePixelRatioFor = function devicePixelRatioFor(): number {
	const value = typeof window === 'undefined' ? 1 : window.devicePixelRatio;

	return Number.isFinite(value) && value > 0 ? value : 1;
};

const measurementFor = function measurementFor(element: HTMLElement): ViewportMeasurement {
	const bounds = element.getBoundingClientRect();

	return {
		left: bounds.left,
		top: bounds.top,
		width: bounds.width,
		height: bounds.height
	};
};

const measurementsEqual = function measurementsEqual(
	left: ViewportMeasurement | undefined,
	right: ViewportMeasurement
): boolean {
	return left?.left === right.left
		&& left?.top === right.top
		&& left?.width === right.width
		&& left?.height === right.height;
};

const localPointFor = function localPointFor(
	point: ViewportPoint,
	measurement: ViewportMeasurement
): ViewportPoint {
	return {
		x: point.x - (measurement.left ?? 0),
		y: point.y - (measurement.top ?? 0)
	};
};

const isViewportControlTarget = function isViewportControlTarget(target: EventTarget | null): boolean {
	return target instanceof Element
		&& target.closest('button, input, select, textarea, [data-viewport-control]') !== null;
};

export const ViewportCanvas = function ViewportCanvas({
	project,
	assets,
	pose,
	onAssetDrop,
	onCanvasSelect,
	onCanvasMarquee,
	selection,
	transformTool,
	onCanvasTransformStart,
	onCanvasTransform,
	gridVisible,
	gridSpacing,
	snapToGrid,
	hiddenIds = new Set<EntityId>()
}: Readonly<{
	project: Project;
	assets: ProjectAssetBlobs;
	pose?: EvaluatedPose;
	onAssetDrop?: (assetId: string, point: ViewportPoint) => void;
	onCanvasSelect?: (point: ViewportPoint, additive: boolean) => void;
	onCanvasMarquee?: (bounds: LogicalBounds, additive: boolean) => void;
	selection?: Selection;
	transformTool?: TransformTool;
	onCanvasTransformStart?: (point: ViewportPoint, tool: TransformTool, modifiers?: TransformModifiers) => boolean;
	onCanvasTransform?: (point: ViewportPoint, phase: TransformPhase, modifiers?: TransformModifiers) => void;
	gridVisible?: boolean;
	gridSpacing?: number;
	snapToGrid?: boolean;
	hiddenIds?: ReadonlySet<EntityId>;
}>): ReactElement {
	const hostRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const pointerSessionRef = useRef<PointerSession | undefined>(undefined);
	const spacePressedRef = useRef(false);
	const didPanRef = useRef(false);
	const renderRequestRef = useRef(0);
	const latestRenderRef = useRef<RenderRequest | undefined>(undefined);
	const renderingRef = useRef(false);
	const [error, setError] = useState<string | undefined>(undefined);
	const [renderer, setRenderer] = useState<EditorViewportRenderer | undefined>(undefined);
	const rendererRef = useRef<EditorViewportRenderer | undefined>(undefined);
	const [measurement, setMeasurement] = useState<ViewportMeasurement | undefined>(undefined);
	const [devicePixelRatio, setDevicePixelRatio] = useState(devicePixelRatioFor);
	const [camera, setCamera] = useState<ViewportCamera>(() => fitViewportCamera(undefined, project.logicalCanvas));
	const [isPanning, setIsPanning] = useState(false);
	const [gestureMode, setGestureMode] = useState<ViewportGestureMode>('idle');
	const [marquee, setMarquee] = useState<ViewportRectangle | undefined>(undefined);
	const [pointerPoint, setPointerPoint] = useState<ViewportPoint | undefined>(undefined);
	const cameraRef = useRef(camera);
	const measurementRef = useRef(measurement);
	const projectRef = useRef(project);
	const canvasSelectRef = useRef(onCanvasSelect);
	const canvasMarqueeRef = useRef(onCanvasMarquee);
	const transformStartRef = useRef(onCanvasTransformStart);
	const transformRef = useRef(onCanvasTransform);
	const transformToolRef = useRef<TransformTool>(transformTool ?? 'translate');
	const gridSpacingRef = useRef(gridSpacing ?? DEFAULT_GRID_SETTINGS.spacing);
	const snapToGridRef = useRef(snapToGrid ?? DEFAULT_GRID_SETTINGS.snap);
	cameraRef.current = camera;
	measurementRef.current = measurement;
	projectRef.current = project;
	canvasSelectRef.current = onCanvasSelect;
	canvasMarqueeRef.current = onCanvasMarquee;
	transformStartRef.current = onCanvasTransformStart;
	transformRef.current = onCanvasTransform;
	transformToolRef.current = transformTool ?? 'translate';
	gridSpacingRef.current = gridSpacing ?? DEFAULT_GRID_SETTINGS.spacing;
	snapToGridRef.current = snapToGrid ?? DEFAULT_GRID_SETTINGS.snap;

	const updateCamera = function updateCamera(nextCamera: ViewportCamera): void {
		cameraRef.current = nextCamera;
		setCamera(nextCamera);
	};

	const currentMeasurement = function currentMeasurement(): ViewportMeasurement | undefined {
		const viewport = viewportRef.current;

		return viewport ? measurementFor(viewport) : measurementRef.current;
	};

	const logicalPointAt = function logicalPointAt(
		screenPoint: ViewportPoint,
		viewportMeasurement: ViewportMeasurement,
		snap: boolean
	): ViewportPoint {
		const point = screenToWorldPoint(
			screenPoint,
			viewportMeasurement,
			cameraRef.current,
			projectRef.current.logicalCanvas
		);

		return snap ? snapPointToGrid(point, gridSpacingRef.current) : point;
	};

	useEffect(() => {
		const viewport = viewportRef.current;

		if (!viewport) {
			return function cleanup(): void {};
		}

		const measure = function measure(): void {
			const nextMeasurement = measurementFor(viewport);

			setMeasurement((current) => measurementsEqual(current, nextMeasurement) ? current : nextMeasurement);
			setDevicePixelRatio((current) => {
				const nextRatio = devicePixelRatioFor();

				return Object.is(current, nextRatio) ? current : nextRatio;
			});
		};
		const observer = typeof ResizeObserver === 'undefined'
			? undefined
			: new ResizeObserver(measure);

		measure();
		observer?.observe(viewport);
		window.addEventListener('resize', measure);

		return function cleanup(): void {
			observer?.disconnect();
			window.removeEventListener('resize', measure);
		};
	}, []);

	useEffect(() => {
		updateCamera(fitViewportCamera(measurementRef.current, project.logicalCanvas));
	}, [project.id, project.logicalCanvas.height, project.logicalCanvas.width]);

	useEffect(() => {
		if (!measurement) {
			return function cleanup(): void {};
		}

		updateCamera(resizeViewportCamera(cameraRef.current, measurement, project.logicalCanvas));
	}, [measurement, project.logicalCanvas.height, project.logicalCanvas.width]);

	useEffect(() => {
		const host = hostRef.current;

		if (!host) {
			return function cleanup(): void {};
		}

		const lifecycle = { cancelled: false };

		setError(undefined);
		void createEditorViewportRenderer(host, {
			width: measurementRef.current?.width ?? 1,
			height: measurementRef.current?.height ?? 1,
			resolution: devicePixelRatioFor()
		})
			.then((created) => {
				if (!created.ok) {
					if (!lifecycle.cancelled) {
						setError(created.error.message);
					}
					return;
				}
				if (lifecycle.cancelled) {
					created.value.destroy();
					return;
				}

				rendererRef.current = created.value;
				setRenderer(created.value);
			})
			.catch((reason: unknown) => {
				if (!lifecycle.cancelled) {
					setError(reason instanceof Error ? reason.message : 'Canvas rendering failed.');
				}
			});

		return function cleanup(): void {
			lifecycle.cancelled = true;
			renderRequestRef.current += 1;
			latestRenderRef.current = undefined;
			rendererRef.current?.destroy();
			rendererRef.current = undefined;
			setRenderer(undefined);
		};
	}, [project.logicalCanvas.height, project.logicalCanvas.width]);

	useEffect(() => {
		if (!renderer || !measurement) {
			return function cleanup(): void {};
		}

		const resized = renderer.resize({
			width: measurement.width,
			height: measurement.height,
			resolution: devicePixelRatio
		});

		if (!resized.ok) {
			setError(resized.error.message);
		}

		return function cleanup(): void {};
	}, [devicePixelRatio, measurement?.height, measurement?.width, renderer]);

	useEffect(() => {
		if (!renderer) {
			return function cleanup(): void {};
		}

		const cameraResult = renderer.setCamera(camera, project.logicalCanvas);

		if (!cameraResult.ok) {
			setError(cameraResult.error.message);
		}

		return function cleanup(): void {};
	}, [camera, project.logicalCanvas.height, project.logicalCanvas.width, renderer]);

	useEffect(() => {
		const requestId = renderRequestRef.current + 1;

		renderRequestRef.current = requestId;
		latestRenderRef.current = renderer
			? {
				id: requestId,
				renderer,
				project,
				assets,
				pose,
				gridVisible,
				gridSpacing,
				hiddenIds,
				selectedIds: selection?.map((entity) => entity.id) ?? [],
				transformTool
			}
			: undefined;

		const renderLatest = async function renderLatest(): Promise<void> {
			const request = latestRenderRef.current;

			latestRenderRef.current = undefined;

			if (!request) {
				renderingRef.current = false;
				return;
			}

			if (renderRequestRef.current !== request.id) {
				return renderLatest();
			}

			try {
				const rendered = request.pose
					? await request.renderer.renderPose(request.project, request.pose, request.assets, {
						gridVisible: request.gridVisible,
						gridSpacing: request.gridSpacing,
						hiddenIds: request.hiddenIds,
						selectedIds: request.selectedIds,
						transformTool: request.transformTool,
						showBones: true,
						showGameplay: true
					})
					: await request.renderer.renderSetup(request.project, request.assets, {
						selectedIds: request.selectedIds,
						transformTool: request.transformTool,
						gridVisible: request.gridVisible,
						gridSpacing: request.gridSpacing,
						hiddenIds: request.hiddenIds
					});

				if (renderRequestRef.current === request.id) {
					if (!rendered.ok) {
						setError(rendered.error.message);
					} else {
						setError(undefined);
					}
				}
			} catch (reason: unknown) {
				if (renderRequestRef.current === request.id) {
					setError(reason instanceof Error ? reason.message : 'Canvas rendering failed.');
				}
			}

			return renderLatest();
		};

		if (!renderingRef.current && renderer) {
			renderingRef.current = true;
			void renderLatest();
		}

		return function cleanup(): void {
			if (renderRequestRef.current === requestId) {
				renderRequestRef.current += 1;
			}
			if (latestRenderRef.current?.id === requestId) {
				latestRenderRef.current = undefined;
			}
		};
	}, [assets, gridSpacing, gridVisible, hiddenIds, pose, project, renderer, selection, transformTool]);

	const beginPan = function beginPan(event: PointerEvent): void {
		if (event.button !== 0 && event.button !== 1) {
			return;
		}

		didPanRef.current = false;
		const stage = currentMeasurement();
		const panRequested = event.button === 1 || spacePressedRef.current;
		const startPoint = stage
			? logicalPointAt({ x: event.clientX, y: event.clientY }, stage, snapToGridRef.current)
			: undefined;
		const transformStart = transformStartRef.current;
		const transformClaimed = !panRequested
			&& !!startPoint
			&& !!transformStart
			&& transformStart(startPoint, transformToolRef.current, { shiftKey: event.shiftKey });
		const mode = canvasGestureModeFor(event.button, spacePressedRef.current, transformClaimed);

		if (panRequested || mode !== 'transform') {
			event.preventDefault();
		}

		pointerSessionRef.current = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			startX: event.clientX,
			startY: event.clientY,
			mode,
			constrained: event.shiftKey,
			additive: event.metaKey || event.ctrlKey
		};
		setMarquee(undefined);
		hostRef.current?.setPointerCapture(event.pointerId);
		setGestureMode(mode);
		setIsPanning(mode === 'pan');
	};

	const movePan = function movePan(event: PointerEvent): void {
		const session = pointerSessionRef.current;

		if (!session || session.id !== event.pointerId) {
			return;
		}
		const deltaX = event.clientX - session.x;
		const deltaY = event.clientY - session.y;

		if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) >= 3) {
			didPanRef.current = true;
		}

		if (session.mode === 'transform') {
			const stage = currentMeasurement();
			const onTransform = transformRef.current;

			if (stage && onTransform) {
				onTransform(logicalPointAt({ x: event.clientX, y: event.clientY }, stage, snapToGridRef.current), 'update', { shiftKey: session.constrained });
			}
		} else if (session.mode === 'marquee' && didPanRef.current) {
			const stage = currentMeasurement();

			if (stage) {
				setMarquee(normalizeViewportRectangle(
					localPointFor({ x: session.startX, y: session.startY }, stage),
					localPointFor({ x: event.clientX, y: event.clientY }, stage)
				));
			}
		} else if (session.mode === 'pan') {
			updateCamera(panViewportCamera(cameraRef.current, { x: deltaX, y: deltaY }));
		}
		pointerSessionRef.current = { ...session, x: event.clientX, y: event.clientY };
	};

	const endPan = function endPan(event: PointerEvent, select: boolean): void {
		const session = pointerSessionRef.current;

		if (!session || session.id !== event.pointerId) {
			return;
		}
		const stage = currentMeasurement();
		const onSelect = canvasSelectRef.current;
		const onMarquee = canvasMarqueeRef.current;
		const onTransform = transformRef.current;
		const currentPoint = stage
			? logicalPointAt({ x: event.clientX, y: event.clientY }, stage, snapToGridRef.current)
			: undefined;

		if (session.mode === 'transform' && onTransform && currentPoint) {
			onTransform(currentPoint, select ? 'end' : 'cancel', { shiftKey: session.constrained });
		} else if (select && session.mode === 'marquee' && didPanRef.current && stage && onMarquee) {
			onMarquee(screenRectangleToWorldBounds(
				{ x: session.startX, y: session.startY },
				{ x: event.clientX, y: event.clientY },
				stage,
				cameraRef.current,
				projectRef.current.logicalCanvas
			), session.additive || event.metaKey || event.ctrlKey);
		} else if (select && session.mode === 'marquee' && !didPanRef.current && stage && onSelect) {
			onSelect(
				screenToWorldPoint(
					{ x: event.clientX, y: event.clientY },
					stage,
					cameraRef.current,
					projectRef.current.logicalCanvas
				),
				event.metaKey || event.ctrlKey
			);
		}
		setMarquee(undefined);

		if (hostRef.current?.hasPointerCapture(event.pointerId)) {
			hostRef.current.releasePointerCapture(event.pointerId);
		}
		pointerSessionRef.current = undefined;
		setGestureMode('idle');
		setIsPanning(false);
	};

	useEffect(() => {
		const host = hostRef.current;

		if (!host) {
			return function cleanup(): void {};
		}

		const releaseWithSelection = function releaseWithSelection(event: PointerEvent): void {
			endPan(event, true);
		};
		const releaseWithoutSelection = function releaseWithoutSelection(event: PointerEvent): void {
			endPan(event, false);
		};

		host.addEventListener('pointerdown', beginPan, true);
		host.addEventListener('pointermove', movePan, true);
		host.addEventListener('pointerup', releaseWithSelection, true);
		host.addEventListener('pointercancel', releaseWithoutSelection, true);

		return function cleanup(): void {
			host.removeEventListener('pointerdown', beginPan, true);
			host.removeEventListener('pointermove', movePan, true);
			host.removeEventListener('pointerup', releaseWithSelection, true);
			host.removeEventListener('pointercancel', releaseWithoutSelection, true);
		};
	}, []);

	useEffect(() => {
		const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
			if (isShortcutTypingTarget(event.target)) {
				return;
			}
			if (event.key === ' ') {
				spacePressedRef.current = true;
			}
		};
		const onKeyUp = function onKeyUp(event: KeyboardEvent): void {
			if (isShortcutTypingTarget(event.target)) {
				return;
			}
			if (event.key === ' ') {
				spacePressedRef.current = false;
			}
		};

		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);

		return function cleanup(): void {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, []);

	useEffect(() => {
		const cancelActiveGesture = function cancelActiveGesture(): boolean {
			const session = pointerSessionRef.current;
			const stage = currentMeasurement();
			const onTransform = transformRef.current;

			if (!session) {
				return false;
			}
			if (session.mode === 'transform' && stage && onTransform) {
				onTransform(logicalPointAt({ x: session.startX, y: session.startY }, stage, session.constrained), 'cancel', { shiftKey: session.constrained });
			}
			if (hostRef.current?.hasPointerCapture(session.id)) {
				hostRef.current.releasePointerCapture(session.id);
			}

			pointerSessionRef.current = undefined;
			setMarquee(undefined);
			setGestureMode('idle');
			setIsPanning(false);

			return true;
		};
		const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
			if (event.key === 'Escape' && cancelActiveGesture()) {
				event.preventDefault();
				event.stopPropagation();
			}
		};

		document.addEventListener('keydown', onKeyDown, true);

		return function cleanup(): void {
			document.removeEventListener('keydown', onKeyDown, true);
		};
	}, []);

	const zoomAtCenter = function zoomAtCenter(wheelDelta: number): void {
		updateCamera(zoomViewportCameraAtCenter(cameraRef.current, wheelDelta));
	};

	const fitCanvas = function fitCanvas(): void {
		updateCamera(fitViewportCamera(currentMeasurement(), projectRef.current.logicalCanvas));
	};

	const actualSize = function actualSize(): void {
		updateCamera(actualSizeViewportCamera());
	};

	const zoomWithWheel = function zoomWithWheel(event: ReactWheelEvent<HTMLDivElement>): void {
		if (isViewportControlTarget(event.target)) {
			return;
		}

		event.preventDefault();
		const bounds = measurementFor(event.currentTarget);

		updateCamera(zoomViewportCameraAtPointer(
			cameraRef.current,
			event.deltaY,
			{ x: event.clientX, y: event.clientY },
			bounds
		));
	};

	const updatePointerPoint = function updatePointerPoint(event: ReactPointerEvent<HTMLDivElement>): void {
		const bounds = measurementFor(event.currentTarget);

		setPointerPoint(screenToWorldPoint(
			{ x: event.clientX, y: event.clientY },
			bounds,
			cameraRef.current,
			projectRef.current.logicalCanvas
		));
	};

	const dragOverViewport = function dragOverViewport(event: ReactDragEvent<HTMLDivElement>): void {
		if (!event.dataTransfer.types.includes('application/x-bone-animation-asset') || isViewportControlTarget(event.target)) {
			return;
		}

		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	};

	const dropAsset = function dropAsset(event: ReactDragEvent<HTMLDivElement>): void {
		if (isViewportControlTarget(event.target)) {
			return;
		}

		event.preventDefault();
		const assetId = event.dataTransfer.getData('application/x-bone-animation-asset');
		const stage = currentMeasurement();

		if (!assetId || !stage || !onAssetDrop) {
			return;
		}

		onAssetDrop(assetId, logicalPointAt(
			{ x: event.clientX, y: event.clientY },
			stage,
			snapToGrid ?? DEFAULT_GRID_SETTINGS.snap
		));
	};

	const originScreen = worldToScreenPoint(
		{ x: 0, y: 0 },
		measurement,
		camera,
		project.logicalCanvas
	);
	const originLeft = originScreen.x - (measurement?.left ?? 0);
	const originTop = originScreen.y - (measurement?.top ?? 0);

	return (
		<div
			className="pixi-viewport"
			data-camera-mode={camera.mode}
			data-camera-scale={String(camera.scale)}
			data-camera-offset-x={String(camera.offsetX)}
			data-camera-offset-y={String(camera.offsetY)}
			data-gesture-mode={gestureMode}
			ref={viewportRef}
			role="application"
			aria-label="Editor viewport"
			tabIndex={0}
			onPointerLeave={() => setPointerPoint(undefined)}
			onPointerMove={updatePointerPoint}
			onWheel={zoomWithWheel}
			onDragOver={dragOverViewport}
			onDrop={dropAsset}
		>
			<div
				className={[
					'pixi-host',
					isPanning ? 'is-panning' : '',
					gestureMode === 'marquee' ? 'is-marquee' : '',
					gestureMode === 'transform' ? 'is-transforming' : ''
				].filter(Boolean).join(' ')}
				ref={hostRef}
			/>
			{marquee && <div className="viewport-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }} />}
			{!pose && (
				<div
					className="viewport-origin-accessible"
					role="img"
					aria-label="Setup origin at X 0, Y 0"
					style={{ left: originLeft, top: originTop }}
				/>
			)}
			<div className="viewport-overlay">
				<div className="viewport-coordinate-readout" aria-label="Canvas coordinate readout" role="status">{formatViewportCoordinate(pointerPoint)}</div>
				<div className="viewport-controls" aria-label="Viewport controls">
					<Tooltip label="Zoom out">
						<button data-viewport-control type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomAtCenter(1)}>−</button>
					</Tooltip>
					<Tooltip label="Fit canvas">
						<button data-viewport-control type="button" aria-label="Fit canvas" title="Fit canvas" onClick={fitCanvas}>Fit</button>
					</Tooltip>
					<Tooltip label="Actual size">
						<button data-viewport-control type="button" aria-label="Actual size" title="Actual size · 100%" onClick={actualSize}>100%</button>
					</Tooltip>
					<Tooltip label="Reset viewport">
						<button data-viewport-control data-testid="viewport-zoom-status" type="button" aria-label="Reset viewport" title="Current zoom; reset to actual size" onClick={actualSize}>{formatViewportScale(camera.scale)}</button>
					</Tooltip>
					<Tooltip label="Zoom in">
						<button data-viewport-control type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomAtCenter(-1)}>+</button>
					</Tooltip>
					<Tooltip label="Center viewport">
						<button data-viewport-control type="button" aria-label="Center viewport" title="Center viewport at actual size" onClick={actualSize}>Center</button>
					</Tooltip>
				</div>
			</div>
			{error && <div className="renderer-error" role="alert">{error}</div>}
		</div>
	);
};
