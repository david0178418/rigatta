import { timelineHeightBounds } from './timeline-layout.ts';

export type WorkspaceLayout = Readonly<{
	leftDockWidth: number;
	rightDockWidth: number;
	timelineHeight: number;
	leftDockCollapsed: boolean;
	rightDockCollapsed: boolean;
}>;

export type WorkspaceViewport = Readonly<{
	width: number;
	height: number;
}>;

export type WorkspaceLayoutBounds = Readonly<{
	leftMin: number;
	leftMax: number;
	rightMin: number;
	rightMax: number;
	canvasMin: number;
	timelineMin: number;
	timelineMax: number;
}>;

export const DEFAULT_WORKSPACE_LAYOUT = {
	leftDockWidth: 248,
	rightDockWidth: 286,
	timelineHeight: 260,
	leftDockCollapsed: false,
	rightDockCollapsed: false
} as const satisfies WorkspaceLayout;

export const COLLAPSED_DOCK_WIDTH = 34;
export const MIN_DOCK_WIDTH = 196;
export const MAX_DOCK_WIDTH = 420;
export const MIN_CANVAS_WIDTH = 360;

const finiteOr = function finiteOr(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback;
};

const clamp = function clamp(value: number, minimum: number, maximum: number): number {
	return Math.max(minimum, Math.min(maximum, value));
};

export const workspaceLayoutBounds = function workspaceLayoutBounds(
	viewport: WorkspaceViewport
): WorkspaceLayoutBounds {
	const width = Math.max(0, finiteOr(viewport.width, 0));
	const height = Math.max(0, finiteOr(viewport.height, 0));
	const availableDockWidth = Math.max(0, width - MIN_CANVAS_WIDTH - 2);
	const dockMax = Math.min(MAX_DOCK_WIDTH, Math.floor(availableDockWidth / 2));
	const dockMinimum = Math.min(MIN_DOCK_WIDTH, dockMax);
	const timeline = timelineHeightBounds(height);

	return {
		leftMin: dockMinimum,
		leftMax: dockMax,
		rightMin: dockMinimum,
		rightMax: dockMax,
		canvasMin: MIN_CANVAS_WIDTH,
		timelineMin: timeline.min,
		timelineMax: timeline.max
	};
};

export const clampWorkspaceLayout = function clampWorkspaceLayout(
	layout: WorkspaceLayout,
	viewport: WorkspaceViewport
): WorkspaceLayout {
	const bounds = workspaceLayoutBounds(viewport);
	const leftFallback = Math.min(DEFAULT_WORKSPACE_LAYOUT.leftDockWidth, bounds.leftMax);
	const rightFallback = Math.min(DEFAULT_WORKSPACE_LAYOUT.rightDockWidth, bounds.rightMax);

	return {
		...layout,
		leftDockWidth: layout.leftDockCollapsed
			? COLLAPSED_DOCK_WIDTH
			: clamp(finiteOr(layout.leftDockWidth, leftFallback), bounds.leftMin, bounds.leftMax),
		rightDockWidth: layout.rightDockCollapsed
			? COLLAPSED_DOCK_WIDTH
			: clamp(finiteOr(layout.rightDockWidth, rightFallback), bounds.rightMin, bounds.rightMax),
		timelineHeight: clamp(finiteOr(layout.timelineHeight, DEFAULT_WORKSPACE_LAYOUT.timelineHeight), bounds.timelineMin, bounds.timelineMax)
	};
};

export const workspaceLayoutFromLeftPointer = function workspaceLayoutFromLeftPointer(
	layout: WorkspaceLayout,
	startX: number,
	currentX: number,
	viewport: WorkspaceViewport
): WorkspaceLayout {
	return clampWorkspaceLayout({ ...layout, leftDockWidth: layout.leftDockWidth + currentX - startX }, viewport);
};

export const workspaceLayoutFromRightPointer = function workspaceLayoutFromRightPointer(
	layout: WorkspaceLayout,
	startX: number,
	currentX: number,
	viewport: WorkspaceViewport
): WorkspaceLayout {
	return clampWorkspaceLayout({ ...layout, rightDockWidth: layout.rightDockWidth + startX - currentX }, viewport);
};

export const workspaceLayoutFromKeyboard = function workspaceLayoutFromKeyboard(
	layout: WorkspaceLayout,
	dock: 'left' | 'right',
	key: string,
	viewport: WorkspaceViewport,
	step = 16
): WorkspaceLayout | undefined {
	const current = dock === 'left' ? layout.leftDockWidth : layout.rightDockWidth;
	const delta = key === 'ArrowLeft' ? -step : key === 'ArrowRight' ? step : undefined;

	if (delta === undefined && key !== 'Home' && key !== 'End') {
		return undefined;
	}

	const bounds = workspaceLayoutBounds(viewport);
	const minimum = dock === 'left' ? bounds.leftMin : bounds.rightMin;
	const maximum = dock === 'left' ? bounds.leftMax : bounds.rightMax;
	const next = key === 'Home'
		? minimum
		: key === 'End'
			? maximum
			: current + (delta ?? 0);

	return clampWorkspaceLayout({
		...layout,
		...(dock === 'left' ? { leftDockWidth: next } : { rightDockWidth: next })
	}, viewport);
};
