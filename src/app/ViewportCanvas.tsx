import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type PointerEvent as ReactPointerEvent, type ReactElement, type WheelEvent as ReactWheelEvent } from 'react';
import type { Project } from '../domain/model.ts';
import type { EntityId } from '../domain/ids.ts';
import type { EvaluatedPose } from '../domain/pose.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import type { FixedCanvasRenderer } from '../rendering/fixed-canvas.ts';
import { createFixedCanvasRenderer } from '../rendering/fixed-canvas.ts';
import { createViewportState, formatViewportCoordinate, formatViewportZoom, normalizeViewportRectangle, panViewport, resetViewport, screenRectangleToLogicalBounds, screenToLogicalPoint, zoomViewport, type LogicalBounds, type ViewportPoint, type ViewportRectangle, type ViewportState } from './viewport.ts';
import { DEFAULT_GRID_SETTINGS, snapPointToGrid } from './grid.ts';
import type { Selection } from './selection.ts';
import { canvasGestureModeFor, type CanvasGestureMode, type TransformModifiers, type TransformPhase, type TransformTool } from './transform-gesture.ts';

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
	const renderQueueRef = useRef<Promise<void>>(Promise.resolve());
	const renderRequestRef = useRef(0);
	const [error, setError] = useState<string | undefined>(undefined);
	const [renderer, setRenderer] = useState<FixedCanvasRenderer | undefined>(undefined);
	const rendererRef = useRef<FixedCanvasRenderer | undefined>(undefined);
	const [viewport, setViewport] = useState<ViewportState>(createViewportState);
	const [isPanning, setIsPanning] = useState(false);
	const [gestureMode, setGestureMode] = useState<ViewportGestureMode>('idle');
	const [marquee, setMarquee] = useState<ViewportRectangle | undefined>(undefined);
	const [pointerPoint, setPointerPoint] = useState<ViewportPoint | undefined>(undefined);
	const viewportStateRef = useRef(viewport);
	const projectRef = useRef(project);
	const canvasSelectRef = useRef(onCanvasSelect);
	const canvasMarqueeRef = useRef(onCanvasMarquee);
	const transformStartRef = useRef(onCanvasTransformStart);
	const transformRef = useRef(onCanvasTransform);
	const transformToolRef = useRef<TransformTool>(transformTool ?? 'translate');
	const gridSpacingRef = useRef(gridSpacing ?? DEFAULT_GRID_SETTINGS.spacing);
	const snapToGridRef = useRef(snapToGrid ?? DEFAULT_GRID_SETTINGS.snap);
	viewportStateRef.current = viewport;
	projectRef.current = project;
	canvasSelectRef.current = onCanvasSelect;
	canvasMarqueeRef.current = onCanvasMarquee;
	transformStartRef.current = onCanvasTransformStart;
	transformRef.current = onCanvasTransform;
	transformToolRef.current = transformTool ?? 'translate';
	gridSpacingRef.current = gridSpacing ?? DEFAULT_GRID_SETTINGS.spacing;
	snapToGridRef.current = snapToGrid ?? DEFAULT_GRID_SETTINGS.snap;

	useEffect(() => {
		const host = hostRef.current;

		if (!host) {
			return function cleanup(): void {};
		}

		const lifecycle = { cancelled: false };

		setError(undefined);
		void createFixedCanvasRenderer(host, {
			width: project.logicalCanvas.width,
			height: project.logicalCanvas.height
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
			rendererRef.current?.destroy();
			rendererRef.current = undefined;
			setRenderer(undefined);
		};
	}, [project.logicalCanvas.height, project.logicalCanvas.width]);

	useEffect(() => {
		if (!renderer) {
			return function cleanup(): void {};
		}

		const requestId = renderRequestRef.current + 1;
		renderRequestRef.current = requestId;
		let cancelled = false;
		const renderCurrent = async function renderCurrent(): Promise<void> {
			if (cancelled || renderRequestRef.current !== requestId) {
				return;
			}

			try {
				const rendered = pose
					? await renderer.renderPose(project, pose, assets, {
						gridVisible,
						gridSpacing,
						hiddenIds,
						showBones: true,
						showGameplay: true
					})
					: await renderer.renderSetup(project, assets, {
						selectedIds: selection?.map((entity) => entity.id),
						transformTool,
						gridVisible,
						gridSpacing,
						hiddenIds
					});

				if (cancelled || renderRequestRef.current !== requestId) {
					return;
				}
				if (!rendered.ok) {
					setError(rendered.error.message);
					return;
				}

				setError(undefined);
			} catch (reason: unknown) {
				if (!cancelled && renderRequestRef.current === requestId) {
					setError(reason instanceof Error ? reason.message : 'Canvas rendering failed.');
				}
			}
		};

		renderQueueRef.current = renderQueueRef.current.then(renderCurrent, renderCurrent);

		return function cleanup(): void {
			cancelled = true;
		};
	}, [assets, gridSpacing, gridVisible, hiddenIds, pose, project, renderer, selection, transformTool]);

	const logicalPointAt = function logicalPointAt(
		screenPoint: ViewportPoint,
		stage: DOMRect,
		snap: boolean
	): ViewportPoint {
		const point = screenToLogicalPoint(
			screenPoint,
			stage,
			viewportStateRef.current,
			projectRef.current.logicalCanvas
		);

		return snap ? snapPointToGrid(point, gridSpacingRef.current) : point;
	};

	const beginPan = function beginPan(event: PointerEvent): void {
		if (event.button !== 0 && event.button !== 1) {
			return;
		}

		didPanRef.current = false;
		const stage = viewportRef.current?.getBoundingClientRect();
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
			const stage = viewportRef.current?.getBoundingClientRect();
			const onTransform = transformRef.current;

			if (stage && onTransform) {
				onTransform(logicalPointAt({ x: event.clientX, y: event.clientY }, stage, snapToGridRef.current), 'update', { shiftKey: session.constrained });
			}
		} else if (session.mode === 'marquee' && didPanRef.current) {
			const stage = viewportRef.current?.getBoundingClientRect();

			if (stage) {
				setMarquee(normalizeViewportRectangle(
					{ x: session.startX - stage.left, y: session.startY - stage.top },
					{ x: event.clientX - stage.left, y: event.clientY - stage.top }
				));
			}
		} else if (session.mode === 'pan') {
			setViewport((current) => panViewport(current, { x: deltaX, y: deltaY }));
		}
		pointerSessionRef.current = { ...session, x: event.clientX, y: event.clientY };
	};

	const endPan = function endPan(event: PointerEvent, select: boolean): void {
		const session = pointerSessionRef.current;

		if (!session || session.id !== event.pointerId) {
			return;
		}
		const stage = viewportRef.current?.getBoundingClientRect();
		const onSelect = canvasSelectRef.current;
		const onMarquee = canvasMarqueeRef.current;
		const onTransform = transformRef.current;
		const currentPoint = stage
			? logicalPointAt({ x: event.clientX, y: event.clientY }, stage, snapToGridRef.current)
			: undefined;

		if (session.mode === 'transform' && onTransform && currentPoint) {
			onTransform(currentPoint, select ? 'end' : 'cancel', { shiftKey: session.constrained });
		} else if (select && session.mode === 'marquee' && didPanRef.current && stage && onMarquee) {
			onMarquee(screenRectangleToLogicalBounds(
				{ x: session.startX, y: session.startY },
				{ x: event.clientX, y: event.clientY },
				stage,
				viewportStateRef.current,
				projectRef.current.logicalCanvas
			), session.additive || event.metaKey || event.ctrlKey);
		} else if (select && session.mode === 'marquee' && !didPanRef.current && stage && onSelect) {
			onSelect(screenToLogicalPoint(
				{ x: event.clientX, y: event.clientY },
				stage,
				viewportStateRef.current,
				projectRef.current.logicalCanvas
			), event.metaKey || event.ctrlKey);
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
	}, [assets, project]);

	useEffect(() => {
		const onKeyDown = function onKeyDown(event: KeyboardEvent): void {
			if (event.key === ' ') {
				event.preventDefault();
				spacePressedRef.current = true;
			}
		};
		const onKeyUp = function onKeyUp(event: KeyboardEvent): void {
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
			const stage = viewportRef.current?.getBoundingClientRect();
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
		setViewport((current) => zoomViewport(current, wheelDelta, { x: 0, y: 0 }));
	};

	const zoomWithWheel = function zoomWithWheel(event: ReactWheelEvent<HTMLDivElement>): void {
		event.preventDefault();
		const bounds = event.currentTarget.getBoundingClientRect();

		setViewport((current) => zoomViewport(current, event.deltaY, {
			x: event.clientX - bounds.left - bounds.width / 2,
			y: event.clientY - bounds.top - bounds.height / 2
		}));
	};

	const updatePointerPoint = function updatePointerPoint(event: ReactPointerEvent<HTMLDivElement>): void {
		const bounds = event.currentTarget.getBoundingClientRect();

		setPointerPoint(screenToLogicalPoint(
			{ x: event.clientX, y: event.clientY },
			bounds,
			viewportStateRef.current,
			projectRef.current.logicalCanvas
		));
	};

	const viewportTransform = `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.zoom})`;

	const dragOverViewport = function dragOverViewport(event: ReactDragEvent<HTMLDivElement>): void {
		if (!event.dataTransfer.types.includes('application/x-bone-animation-asset')) {
			return;
		}

		event.preventDefault();
		event.dataTransfer.dropEffect = 'copy';
	};

	const dropAsset = function dropAsset(event: ReactDragEvent<HTMLDivElement>): void {
		event.preventDefault();
		const assetId = event.dataTransfer.getData('application/x-bone-animation-asset');
		const stage = viewportRef.current?.getBoundingClientRect();

		if (!assetId || !stage || !onAssetDrop) {
			return;
		}

		onAssetDrop(assetId, logicalPointAt(
			{ x: event.clientX, y: event.clientY },
			stage,
			snapToGrid ?? DEFAULT_GRID_SETTINGS.snap
		));
	};

	return (
		<div
			className="pixi-viewport"
			data-gesture-mode={gestureMode}
			ref={viewportRef}
			aria-label="Pixi fixed logical canvas"
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
				style={{ transform: viewportTransform }}
			/>
			{marquee && <div className="viewport-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }} />}
			<div className="viewport-content-overlay" style={{ transform: viewportTransform }}>
				<div className="viewport-canvas-boundary" />
				{!pose && (
					<div className="viewport-origin-marker" role="img" aria-label="Setup origin at X 0, Y 0">
						<span className="viewport-origin-crosshair" aria-hidden="true" />
						<span className="viewport-origin-label" aria-hidden="true">0,0</span>
					</div>
				)}
			</div>
			<div className="viewport-overlay">
				<div className="viewport-coordinate-readout" aria-label="Canvas coordinate readout" role="status">{formatViewportCoordinate(pointerPoint)}</div>
				<div className="viewport-controls" aria-label="Viewport controls">
					<button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => zoomAtCenter(1)}>−</button>
					<button type="button" aria-label="Reset viewport" title="Reset viewport" onClick={() => setViewport(resetViewport())}>{formatViewportZoom(viewport.zoom)}</button>
					<button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => zoomAtCenter(-1)}>+</button>
					<button type="button" aria-label="Center viewport" title="Center viewport" onClick={() => setViewport(resetViewport())}>Center</button>
				</div>
			</div>
			{error && <div className="renderer-error" role="alert">{error}</div>}
		</div>
	);
};
