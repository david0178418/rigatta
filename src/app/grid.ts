import type { Point } from '../domain/coordinates.ts';

export type GridSettings = Readonly<{
	visible: boolean;
	spacing: number;
	snap: boolean;
}>;

export const DEFAULT_GRID_SETTINGS = {
	visible: true,
	spacing: 32,
	snap: false
} as const satisfies GridSettings;

export const snapPointToGrid = function snapPointToGrid(point: Point, spacing: number): Point {
	if (!Number.isFinite(spacing) || spacing <= 0) {
		return point;
	}

	return {
		x: Math.round(point.x / spacing) * spacing,
		y: Math.round(point.y / spacing) * spacing
	};
};
