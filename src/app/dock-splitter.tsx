import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { workspaceLayoutBounds, workspaceLayoutFromKeyboard, workspaceLayoutFromLeftPointer, workspaceLayoutFromRightPointer, type WorkspaceLayout, type WorkspaceViewport } from './workspace-layout.ts';

export const DockSplitter = function DockSplitter({
	dock,
	layout,
	viewport,
	onChange
}: Readonly<{
	dock: 'left' | 'right';
	layout: WorkspaceLayout;
	viewport: WorkspaceViewport;
	onChange: (layout: WorkspaceLayout) => void;
}>): ReactElement {
	const [dragging, setDragging] = useState(false);
	const sessionRef = useRef<Readonly<{ pointerId: number; startX: number; layout: WorkspaceLayout }> | undefined>(undefined);
	const bounds = workspaceLayoutBounds(viewport);
	const current = dock === 'left' ? layout.leftDockWidth : layout.rightDockWidth;
	const minimum = dock === 'left' ? bounds.leftMin : bounds.rightMin;
	const maximum = dock === 'left' ? bounds.leftMax : bounds.rightMax;
	const onPointerDown = function onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
		if (event.button !== 0) {
			return;
		}

		event.preventDefault();
		event.currentTarget.setPointerCapture(event.pointerId);
		sessionRef.current = { pointerId: event.pointerId, startX: event.clientX, layout };
		setDragging(true);
	};
	const onPointerMove = function onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
		const session = sessionRef.current;

		if (!session || session.pointerId !== event.pointerId) {
			return;
		}

		onChange(dock === 'left'
			? workspaceLayoutFromLeftPointer(session.layout, session.startX, event.clientX, viewport)
			: workspaceLayoutFromRightPointer(session.layout, session.startX, event.clientX, viewport));
	};
	const onPointerUp = function onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
		if (!sessionRef.current || sessionRef.current.pointerId !== event.pointerId) {
			return;
		}

		sessionRef.current = undefined;
		setDragging(false);

		if (event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	};
	const onKeyDown = function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
		const next = workspaceLayoutFromKeyboard(layout, dock, event.key, viewport);

		if (!next) {
			return;
		}

		event.preventDefault();
		onChange(next);
	};

	return (
		<div
			aria-label={`Resize ${dock} dock`}
			aria-orientation="vertical"
			aria-valuemax={maximum}
			aria-valuemin={minimum}
			aria-valuenow={current}
			aria-valuetext={`${current} pixels`}
			className={dragging ? 'dock-splitter is-dragging' : 'dock-splitter'}
			role="separator"
			tabIndex={0}
			onKeyDown={onKeyDown}
			onPointerCancel={onPointerUp}
			onPointerDown={onPointerDown}
			onPointerMove={onPointerMove}
			onPointerUp={onPointerUp}
		>
			<span aria-hidden="true" />
		</div>
	);
};
