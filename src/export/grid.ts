import type { RgbaFrame } from './trim.ts';

export type GridPlacement = Readonly<{
	index: number;
	x: number;
	y: number;
	width: number;
	height: number;
}>;

export type GridLayout = Readonly<{
	width: number;
	height: number;
	columns: number;
	rows: number;
	placements: readonly GridPlacement[];
}>;

export type GridPageLayout = Readonly<{
	index: number;
	offset: number;
	layout: GridLayout;
}>;

export type GridResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

const success = function success<TValue>(value: TValue): GridResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(error: string): GridResult<never> {
	return { ok: false, error };
};

const validPositiveInteger = function validPositiveInteger(value: number): boolean {
	return Number.isInteger(value) && value > 0;
};

export const createGridLayout = function createGridLayout(
	frameWidth: number,
	frameHeight: number,
	frameCount: number,
	maxTextureSize: number
): GridResult<GridLayout> {
	if (!validPositiveInteger(frameWidth) || !validPositiveInteger(frameHeight)) {
		return failure('Grid frame dimensions must be positive integers.');
	}
	if (!validPositiveInteger(frameCount)) {
		return failure('Grid frame count must be a positive integer.');
	}
	if (!validPositiveInteger(maxTextureSize)) {
		return failure('Grid texture size must be a positive integer.');
	}

	const columns = Math.floor(maxTextureSize / frameWidth);

	if (columns < 1) {
		return failure('Grid frame width exceeds the maximum texture size.');
	}

	const rows = Math.ceil(frameCount / columns);
	const width = Math.min(columns, frameCount) * frameWidth;
	const height = rows * frameHeight;

	if (height > maxTextureSize) {
		return failure('Grid frame count exceeds the maximum texture height.');
	}

	return success({
		width,
		height,
		columns,
		rows,
		placements: Array.from({ length: frameCount }, (_, index) => ({
			index,
			x: (index % columns) * frameWidth,
			y: Math.floor(index / columns) * frameHeight,
			width: frameWidth,
			height: frameHeight
		}))
	});
};

export const createGridPageLayouts = function createGridPageLayouts(
	frameWidth: number,
	frameHeight: number,
	frameCount: number,
	maxTextureSize: number
): GridResult<readonly GridPageLayout[]> {
	if (!validPositiveInteger(frameWidth) || !validPositiveInteger(frameHeight)) {
		return failure('Grid frame dimensions must be positive integers.');
	}
	if (!validPositiveInteger(frameCount)) {
		return failure('Grid frame count must be a positive integer.');
	}
	if (!validPositiveInteger(maxTextureSize)) {
		return failure('Grid texture size must be a positive integer.');
	}

	const columns = Math.floor(maxTextureSize / frameWidth);
	const rowsPerPage = Math.floor(maxTextureSize / frameHeight);

	if (columns < 1) {
		return failure('Grid frame width exceeds the maximum texture size.');
	}
	if (rowsPerPage < 1) {
		return failure('Grid frame height exceeds the maximum texture size.');
	}

	const framesPerPage = columns * rowsPerPage;
	const pageCount = Math.ceil(frameCount / framesPerPage);
	const pages = Array.from({ length: pageCount }, (_, index): GridResult<GridPageLayout> => {
		const offset = index * framesPerPage;
		const pageFrameCount = Math.min(framesPerPage, frameCount - offset);
		const layout = createGridLayout(frameWidth, frameHeight, pageFrameCount, maxTextureSize);

		return layout.ok
			? success({ index, offset, layout: layout.value })
			: layout;
	});
	const failedPage = pages.find((page) => !page);

	return failedPage && !failedPage.ok
		? failedPage
		: success(pages.flatMap((page) => page.ok ? [page.value] : []));
};

export const composeGridFrames = function composeGridFrames(
	frames: readonly RgbaFrame[],
	layout: GridLayout
): GridResult<RgbaFrame> {
	if (frames.length !== layout.placements.length) {
		return failure('Grid frame count does not match its layout.');
	}

	const dimensionsMatch = frames.every((frame) => frame.width === layout.placements[0]?.width
		&& frame.height === layout.placements[0]?.height
		&& frame.pixels.byteLength === frame.width * frame.height * 4);

	if (!dimensionsMatch) {
		return failure('Grid frames must have matching dimensions and RGBA buffers.');
	}

	const pixels = new Uint8Array(layout.width * layout.height * 4);

	frames.forEach((frame, index) => {
		const placement = layout.placements[index];

		if (!placement) {
			return;
		}

		Array.from({ length: frame.height }, (_, row) => row).forEach((row) => {
			const sourceStart = row * frame.width * 4;
			const targetStart = ((placement.y + row) * layout.width + placement.x) * 4;

			pixels.set(frame.pixels.subarray(sourceStart, sourceStart + frame.width * 4), targetStart);
		});
	});

	return success({ width: layout.width, height: layout.height, pixels });
};
