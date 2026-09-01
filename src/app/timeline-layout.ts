export const SETUP_TIMELINE_HEIGHT = 54;
export const ANIMATE_TIMELINE_DEFAULT_HEIGHT = 260;
export const ANIMATE_TIMELINE_MIN_HEIGHT = 190;
export const ANIMATE_TIMELINE_MAX_RATIO = 0.55;
export const TIMELINE_RESIZE_STEP = 16;

export type TimelineHeightBounds = Readonly<{
	min: number;
	max: number;
	defaultHeight: number;
}>;

const finiteOr = function finiteOr(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback;
};

const clamp = function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
};

export const timelineHeightBounds = function timelineHeightBounds(viewportHeight: number): TimelineHeightBounds {
	const safeViewportHeight = Math.max(0, finiteOr(viewportHeight, 0));
	const max = Math.max(ANIMATE_TIMELINE_MIN_HEIGHT, Math.floor(safeViewportHeight * ANIMATE_TIMELINE_MAX_RATIO));

	return {
		min: ANIMATE_TIMELINE_MIN_HEIGHT,
		max,
		defaultHeight: clamp(ANIMATE_TIMELINE_DEFAULT_HEIGHT, ANIMATE_TIMELINE_MIN_HEIGHT, max)
	};
};

export const clampTimelineHeight = function clampTimelineHeight(height: number, viewportHeight: number): number {
	const bounds = timelineHeightBounds(viewportHeight);

	return Math.round(clamp(finiteOr(height, bounds.defaultHeight), bounds.min, bounds.max));
};

export const timelineHeightFromPointer = function timelineHeightFromPointer(
	startHeight: number,
	startPointerY: number,
	currentPointerY: number,
	viewportHeight: number
): number {
	return clampTimelineHeight(startHeight + startPointerY - currentPointerY, viewportHeight);
};

export const timelineHeightFromKeyboard = function timelineHeightFromKeyboard(
	height: number,
	key: string,
	viewportHeight: number
): number | undefined {
	const bounds = timelineHeightBounds(viewportHeight);
	const current = clampTimelineHeight(height, viewportHeight);
	const actions: Readonly<Record<'ArrowUp' | 'ArrowDown' | 'Home' | 'End', () => number>> = {
		ArrowUp: () => clamp(current + TIMELINE_RESIZE_STEP, bounds.min, bounds.max),
		ArrowDown: () => clamp(current - TIMELINE_RESIZE_STEP, bounds.min, bounds.max),
		Home: () => bounds.min,
		End: () => bounds.max
	};
	const actionKey = key === 'ArrowUp' || key === 'ArrowDown' || key === 'Home' || key === 'End' ? key : undefined;

	return actionKey ? actions[actionKey]() : undefined;
};
