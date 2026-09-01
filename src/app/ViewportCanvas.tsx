import { useEffect, useRef, useState, type DragEvent as ReactDragEvent, type ReactElement, type WheelEvent as ReactWheelEvent } from 'react';
import type { Project } from '../domain/model.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import type { FixedCanvasRenderer } from '../rendering/fixed-canvas.ts';
import { createFixedCanvasRenderer } from '../rendering/fixed-canvas.ts';
import { createViewportState, formatViewportZoom, normalizeViewportRectangle, panViewport, resetViewport, screenRectangleToLogicalBounds, screenToLogicalPoint, zoomViewport, type LogicalBounds, type ViewportPoint, type ViewportRectangle, type ViewportState } from './viewport.ts';

type PointerSession = Readonly<{
	id: number;
	x: number;
	y: number;
	startX: number;
	startY: number;
	mode: 'pan' | 'marquee';
}>;

export const ViewportCanvas = function ViewportCanvas({
	project,
	assets,
	onAssetDrop,
	onCanvasSelect,
	onCanvasMarquee
}: Readonly<{
	project: Project;
	assets: ProjectAssetBlobs;
	onAssetDrop?: (assetId: string, point: ViewportPoint) => void;
	onCanvasSelect?: (point: ViewportPoint, additive: boolean) => void;
	onCanvasMarquee?: (bounds: LogicalBounds, additive: boolean) => void;
}>): ReactElement {
	const hostRef = useRef<HTMLDivElement>(null);
	const viewportRef = useRef<HTMLDivElement>(null);
	const pointerSessionRef = useRef<PointerSession | undefined>(undefined);
	const didPanRef = useRef(false);
	const [error, setError] = useState<string | undefined>(undefined);
	const [viewport, setViewport] = useState<ViewportState>(createViewportState);
	const [isPanning, setIsPanning] = useState(false);
	const [marquee, setMarquee] = useState<ViewportRectangle | undefined>(undefined);
	const viewportStateRef = useRef(viewport);
	const projectRef = useRef(project);
	const canvasSelectRef = useRef(onCanvasSelect);
	const canvasMarqueeRef = useRef(onCanvasMarquee);
	viewportStateRef.current = viewport;
	projectRef.current = project;
	canvasSelectRef.current = onCanvasSelect;
	canvasMarqueeRef.current = onCanvasMarquee;

	useEffect(() => {
		const host = hostRef.current;

		if (!host) {
			return function cleanup(): void {};
		}

		const lifecycle: {
			cancelled: boolean;
			renderer: FixedCanvasRenderer | undefined;
		} = {
			cancelled: false,
			renderer: undefined
		};

		setError(undefined);
		void createFixedCanvasRenderer(host, project.logicalCanvas)
			.then(async (created) => {
				if (!created.ok) {
					setError(created.error.message);
					return;
				}
				if (lifecycle.cancelled) {
					created.value.destroy();
					return;
				}

				const renderer = created.value;
				lifecycle.renderer = renderer;
				const rendered = await renderer.renderSetup(project, assets);

				if (!rendered.ok && !lifecycle.cancelled) {
					setError(rendered.error.message);
				}
			})
			.catch((reason: unknown) => {
				if (!lifecycle.cancelled) {
					setError(reason instanceof Error ? reason.message : 'Canvas rendering failed.');
				}
			});

		return function cleanup(): void {
			lifecycle.cancelled = true;
			lifecycle.renderer?.destroy();
		};
	}, [assets, project]);

	const beginPan = function beginPan(event: PointerEvent): void {
		if (event.button !== 0) {
			return;
		}

		didPanRef.current = false;
		pointerSessionRef.current = {
			id: event.pointerId,
			x: event.clientX,
			y: event.clientY,
			startX: event.clientX,
			startY: event.clientY,
			mode: event.shiftKey ? 'marquee' : 'pan'
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

		if (session.mode === 'marquee') {
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

		if (select && session.mode === 'marquee' && didPanRef.current && stage && onMarquee) {
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

		onAssetDrop(assetId, screenToLogicalPoint(
			{ x: event.clientX, y: event.clientY },
			stage,
			viewport,
			project.logicalCanvas
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
