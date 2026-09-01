import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactElement, type WheelEvent as ReactWheelEvent } from 'react';
import type { Project } from '../domain/model.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import type { FixedCanvasRenderer } from '../rendering/fixed-canvas.ts';
import { createFixedCanvasRenderer } from '../rendering/fixed-canvas.ts';
import { createViewportState, formatViewportZoom, panViewport, resetViewport, zoomViewport, type ViewportState } from './viewport.ts';

type PointerSession = Readonly<{
	id: number;
	x: number;
	y: number;
}>;

export const ViewportCanvas = function ViewportCanvas({
	project,
	assets
}: Readonly<{ project: Project; assets: ProjectAssetBlobs }>): ReactElement {
	const hostRef = useRef<HTMLDivElement>(null);
	const pointerSessionRef = useRef<PointerSession | undefined>(undefined);
	const [error, setError] = useState<string | undefined>(undefined);
	const [viewport, setViewport] = useState<ViewportState>(createViewportState);
	const [isPanning, setIsPanning] = useState(false);

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

	const beginPan = function beginPan(event: ReactPointerEvent<HTMLDivElement>): void {
		if (event.button !== 0) {
			return;
		}

		pointerSessionRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
		event.currentTarget.setPointerCapture(event.pointerId);
		setIsPanning(true);
	};

	const movePan = function movePan(event: ReactPointerEvent<HTMLDivElement>): void {
		const session = pointerSessionRef.current;

		if (!session || session.id !== event.pointerId) {
			return;
		}

		setViewport((current) => panViewport(current, {
			x: event.clientX - session.x,
			y: event.clientY - session.y
		}));
		pointerSessionRef.current = { id: session.id, x: event.clientX, y: event.clientY };
	};

	const endPan = function endPan(event: ReactPointerEvent<HTMLDivElement>): void {
		const session = pointerSessionRef.current;

		if (!session || session.id !== event.pointerId) {
			return;
		}

		pointerSessionRef.current = undefined;
		setIsPanning(false);
	};

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

	return (
		<div className="pixi-viewport" aria-label="Pixi fixed logical canvas" onWheel={zoomWithWheel}>
			<div
				className={isPanning ? 'pixi-host is-panning' : 'pixi-host'}
				ref={hostRef}
				style={{ transform: `translate(${viewport.offsetX}px, ${viewport.offsetY}px) scale(${viewport.zoom})` }}
				onPointerDown={beginPan}
				onPointerMove={movePan}
				onPointerUp={endPan}
				onPointerCancel={endPan}
			/>
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
