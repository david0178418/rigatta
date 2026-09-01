export type PackSize = Readonly<{
	width: number;
	height: number;
}>;

export type PackRectangle = Readonly<{
	key: string;
	width: number;
	height: number;
}>;

export type PackedRectangle = Readonly<{
	key: string;
	x: number;
	y: number;
	width: number;
	height: number;
}>;

export type PackedAtlas = Readonly<{
	size: PackSize;
	padding: number;
	placements: readonly PackedRectangle[];
}>;

export type PackingResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

type FreeRectangle = Readonly<{
	x: number;
	y: number;
	width: number;
	height: number;
}>;

type PlacementCandidate = Readonly<{
	outer: FreeRectangle;
	placement: PackedRectangle;
	shortSide: number;
	longSide: number;
}>;

type PackingState = Readonly<{
	freeRectangles: readonly FreeRectangle[];
	placements: readonly PackedRectangle[];
}>;

const success = function success<TValue>(value: TValue): PackingResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(error: string): PackingResult<never> {
	return { ok: false, error };
};

const validPositiveInteger = function validPositiveInteger(value: number): boolean {
	return Number.isInteger(value) && value > 0;
};

const validNonnegativeInteger = function validNonnegativeInteger(value: number): boolean {
	return Number.isInteger(value) && value >= 0;
};

const compareStrings = function compareStrings(left: string, right: string): number {
	return left === right ? 0 : left < right ? -1 : 1;
};

const contains = function contains(outer: FreeRectangle, inner: FreeRectangle): boolean {
	return inner.x >= outer.x
		&& inner.y >= outer.y
		&& inner.x + inner.width <= outer.x + outer.width
		&& inner.y + inner.height <= outer.y + outer.height;
};

const intersects = function intersects(left: FreeRectangle, right: FreeRectangle): boolean {
	return left.x < right.x + right.width
		&& left.x + left.width > right.x
		&& left.y < right.y + right.height
		&& left.y + left.height > right.y;
};

const splitFreeRectangle = function splitFreeRectangle(
	free: FreeRectangle,
	used: FreeRectangle
): readonly FreeRectangle[] {
	if (!intersects(free, used)) {
		return [free];
	}

	return [
		free.x < used.x ? { x: free.x, y: free.y, width: used.x - free.x, height: free.height } : undefined,
		free.x + free.width > used.x + used.width
			? { x: used.x + used.width, y: free.y, width: free.x + free.width - used.x - used.width, height: free.height }
			: undefined,
		free.y < used.y ? { x: free.x, y: free.y, width: free.width, height: used.y - free.y } : undefined,
		free.y + free.height > used.y + used.height
			? { x: free.x, y: used.y + used.height, width: free.width, height: free.y + free.height - used.y - used.height }
			: undefined
	].flatMap((rectangle) => rectangle ? [rectangle] : []);
};

const pruneFreeRectangles = function pruneFreeRectangles(
	freeRectangles: readonly FreeRectangle[]
): readonly FreeRectangle[] {
	return freeRectangles.filter((candidate, index) => !freeRectangles.some((other, otherIndex) => (
		index !== otherIndex && contains(other, candidate)
	)));
};

const candidateFor = function candidateFor(
	item: PackRectangle,
	free: FreeRectangle,
	padding: number
): PlacementCandidate | undefined {
	const occupiedWidth = item.width + padding * 2;
	const occupiedHeight = item.height + padding * 2;

	if (occupiedWidth > free.width || occupiedHeight > free.height) {
		return undefined;
	}

	const widthRemainder = free.width - occupiedWidth;
	const heightRemainder = free.height - occupiedHeight;

	return {
		outer: { x: free.x, y: free.y, width: occupiedWidth, height: occupiedHeight },
		placement: {
			key: item.key,
			x: free.x + padding,
			y: free.y + padding,
			width: item.width,
			height: item.height
		},
		shortSide: Math.min(widthRemainder, heightRemainder),
		longSide: Math.max(widthRemainder, heightRemainder)
	};
};

const betterCandidate = function betterCandidate(
	candidate: PlacementCandidate,
	current: PlacementCandidate | undefined
): PlacementCandidate {
	if (!current) {
		return candidate;
	}

	const score = [
		candidate.shortSide - current.shortSide,
		candidate.longSide - current.longSide,
		candidate.outer.y - current.outer.y,
		candidate.outer.x - current.outer.x,
		candidate.outer.width - current.outer.width,
		candidate.outer.height - current.outer.height
	].find((difference) => difference !== 0);

	return score !== undefined && score < 0 ? candidate : current;
};

const bestCandidateFor = function bestCandidateFor(
	item: PackRectangle,
	freeRectangles: readonly FreeRectangle[],
	padding: number
): PlacementCandidate | undefined {
	return freeRectangles.reduce<PlacementCandidate | undefined>((best, free) => {
		const candidate = candidateFor(item, free, padding);

		return candidate ? betterCandidate(candidate, best) : best;
	}, undefined);
};

const placeItem = function placeItem(
	state: PackingState,
	item: PackRectangle,
	padding: number
): PackingResult<PackingState> {
	const candidate = bestCandidateFor(item, state.freeRectangles, padding);

	if (!candidate) {
		return failure(`Packed rectangle ${item.key} does not fit the atlas.`);
	}

	const split = state.freeRectangles.flatMap((free) => splitFreeRectangle(free, candidate.outer));

	return success({
		freeRectangles: pruneFreeRectangles(split),
		placements: [...state.placements, candidate.placement]
	});
};

export const packMaxRects = function packMaxRects(
	items: readonly PackRectangle[],
	size: PackSize,
	padding: number = 0
): PackingResult<PackedAtlas> {
	if (!validPositiveInteger(size.width) || !validPositiveInteger(size.height)) {
		return failure('Atlas dimensions must be positive integers.');
	}
	if (!validNonnegativeInteger(padding)) {
		return failure('Atlas padding must be a nonnegative integer.');
	}
	if (items.some((item) => item.key.trim().length === 0)) {
		return failure('Packed rectangle keys must be non-empty.');
	}
	if (new Set(items.map((item) => item.key)).size !== items.length) {
		return failure('Packed rectangle keys must be unique.');
	}
	if (items.some((item) => !validPositiveInteger(item.width) || !validPositiveInteger(item.height))) {
		return failure('Packed rectangle dimensions must be positive integers.');
	}

	const sortedItems = [...items].sort((left, right) => compareStrings(left.key, right.key));
	const initialState: PackingState = {
		freeRectangles: [{ x: 0, y: 0, width: size.width, height: size.height }],
		placements: []
	};
	const packed = sortedItems.reduce<PackingResult<PackingState>>(
		(state, item) => state.ok ? placeItem(state.value, item, padding) : state,
		success(initialState)
	);

	return packed.ok
		? success({ size, padding, placements: packed.value.placements })
		: packed;
};
