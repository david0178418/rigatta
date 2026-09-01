import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type ReactElement, type WheelEvent as ReactWheelEvent } from 'react';
import type { Project } from '../domain/model.ts';
import type { EvaluatedPose } from '../domain/pose.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import type { FixedCanvasRenderer } from '../rendering/fixed-canvas.ts';
import { createFixedCanvasRenderer } from '../rendering/fixed-canvas.ts';
import { createViewportState, formatViewportZoom, normalizeViewportRectangle, panViewport, resetViewport, screenRectangleToLogicalBounds, screenToLogicalPoint, zoomViewport, type LogicalBounds, type ViewportPoint, type ViewportRectangle, type ViewportState } from './viewport.ts';
import { DEFAULT_GRID_SETTINGS, snapPointToGrid } from './grid.ts';
import type { Selection } from './selection.ts';
import type { TransformPhase, TransformTool } from './transform-gesture.ts';

type PointerSession = Readonly<{
	id: number;
	x: number;
	y: number;
	startX: number;
	startY: number;
	mode: 'pan' | 'marquee' | 'transform';
}>;

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
	snapToGrid
}: Readonly<{
	project: Project;
	assets: ProjectAssetBlobs;
	pose?: EvaluatedPose;
	onAssetDrop?: (assetId: string, point: ViewportPoint) => void;
	onCanvasSelect?: (point: ViewportPoint, additive: boolean) => void;
	onCanvasMarquee?: (bounds: LogicalBounds, additive: boolean) => void;
	selection?: Selection;
	transformTool?: TransformTool;
	onCanvasTransformStart?: (point: ViewportPoint, tool: TransformTool) => boolean;
	onCanvasTransform?: (point: ViewportPoint, phase: TransformPhase) => void;
	gridVisible?: boolean;
	gridSpacing?: number;
	snapToGrid?: boolean;
}>): ReactElement {
	const hostRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const pointerSessionRef = useRef<PointerSession | undefined>(undefined);
	const didPanRef = useRef(false);
	const renderQueueRef = useRef<Promise<void>>(Promise.resolve());
	const renderRequestRef = useRef(0);
	const [error, setError] = useState<string | undefined>(undefined);
	const [renderer, setRenderer] = useState<FixedCanvasRenderer | undefined>(undefined);
	const rendererRef = useRef<FixedCanvasRenderer | undefined>(undefined);
	const [viewport, setViewport] = useState<ViewportState>(createViewportState);
	const [isPanning, setIsPanning] = useState(false);
	const [marquee, setMarquee] = useState<ViewportRectangle | undefined>(undefined);
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
						showBones: true,
						showGameplay: true
					})
					: await renderer.renderSetup(project, assets, {
						selectedIds: selection?.map((entity) => entity.id),
						transformTool,
						gridVisible,
						gridSpacing
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
	}, [assets, gridSpacing, gridVisible, pose, project, renderer, selection, transformTool]);

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
		if (event.button !== 0) {
			return;
		}

		didPanRef.current = false;
		const stage = viewportRef.current?.getBoundingClientRect();
		const startPoint = stage
			? logicalPointAt({ x: event.clientX, y: event.clientY }, stage, snapToGridRef.current)
			: undefined;
		const transformStart = transformStartRef.current;
		const transformClaimed = !event.shiftKey
			&& !!startPoint
			&& !!transformStart
			&& transformStart(startPoint, transformToolRef.current);

		pointerSessionRef.current = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			startX: event.clientX,
			startY: event.clientY,
			mode: transformClaimed ? 'transform' : event.shiftKey ? 'marquee' : 'pan'
		};
		setMarquee(undefined);
		hostRef.current?.setPointerCapture(event.pointerId);
		setIsPanning(true);
	};

	const movePan = function movePan(event: PointerEvent): void {
		const session = pointerSessionRef.current;

		if (!session || session.id !== event.pointerId) {
			return;
		}
		const deltaX = event.clientX - session.x;
		const deltaY = event.clientY - session.y;

		if (deltaX !== 0 || deltaY !== 0) {
			didPanRef.current = true;
		}

		if (session.mode === 'transform') {
			const stage = viewportRef.current?.getBoundingClientRect();
			const onTransform = transformRef.current;

			if (stage && onTransform) {
				onTransform(logicalPointAt({ x: event.clientX, y: event.clientY }, stage, snapToGridRef.current), 'update');
			}
		} else if (session.mode === 'marquee') {
			const stage = viewportRef.current?.getBoundingClientRect();

			if (stage) {
				setMarquee(normalizeViewportRectangle(
					{ x: session.startX - stage.left, y: session.startY - stage.top },
					{ x: event.clientX - stage.left, y: event.clientY - stage.top }
				));
			}
		} else {
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
			onTransform(currentPoint, select ? 'end' : 'cancel');
		} else if (select && session.mode === 'marquee' && didPanRef.current && stage && onMarquee) {
			onMarquee(screenRectangleToLogicalBounds(
				{ x: session.startX, y: session.startY },
				{ x: event.clientX, y: event.clientY },
				stage,
				viewportStateRef.current,
				projectRef.current.logicalCanvas
			), event.metaKey || event.ctrlKey);
		} else if (select && !didPanRef.current && stage && onSelect) {
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
			ref={viewportRef}
			aria-label="Pixi fixed logical canvas"
			onWheel={zoomWithWheel}
			onDragOver={dragOverViewport}
			onDrop={dropAsset}
		>
			<div
				className={isPanning ? 'pixi-host is-panning' : 'pixi-host'}
				ref={hostRef}
				style={{ transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.zoom})` }}
			/>
			{marquee && <div className="viewport-marquee" style={{ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }} />}
			<div className="viewport-controls" aria-label="Viewport controls">
				<button type="button" aria-label="Zoom out" onClick={() => zoomAtCenter(1)}>−</button>
				<button type="button" aria-label="Reset viewport">{formatViewportZoom(viewport.zoom)}</button>
				<button type="button" aria-label="Zoom in" onClick={() => zoomAtCenter(-1)}>+</button>
				<button type="button" aria-label="Center viewport" onClick={() => setViewport(resetViewport())}>Center</button>
			</div>
			{error && <div className="renderer-error" role="alert">{error}</div>}
		</div>
	);
};
