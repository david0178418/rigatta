import type { CubicBezier, DiscreteKey, Interpolation, NumberKey } from './model.ts';

const clamp01 = function clamp01(value: number): number {
	return Math.max(0, Math.min(1, value));
};

const cubic = function cubic(
	start: number,
	control1: number,
	control2: number,
	end: number,
	parameter: number
): number {
	const inverse = 1 - parameter;

	return inverse ** 3 * start
		+ 3 * inverse ** 2 * parameter * control1
		+ 3 * inverse * parameter ** 2 * control2
		+ parameter ** 3 * end;
};

const solveBezierParameter = function solveBezierParameter(
	targetX: number,
	curve: CubicBezier,
	lower: number,
	upper: number,
	iterations: number
): number {
	const midpoint = (lower + upper) / 2;

	if (iterations === 0) {
		return midpoint;
	}

	return cubic(0, curve.x1, curve.x2, 1, midpoint) < targetX
		? solveBezierParameter(targetX, curve, midpoint, upper, iterations - 1)
		: solveBezierParameter(targetX, curve, lower, midpoint, iterations - 1);
};

export const evaluateCubicBezier = function evaluateCubicBezier(
	progress: number,
	curve: CubicBezier
): number {
	const targetX = clamp01(progress);
	const parameter = solveBezierParameter(targetX, curve, 0, 1, 24);

	return cubic(0, curve.y1, curve.y2, 1, parameter);
};

export const shortestAngleDelta = function shortestAngleDelta(
	start: number,
	end: number
): number {
	const fullTurn = Math.PI * 2;
	const directDelta = end - start;
	const wrappedDelta = ((directDelta + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI;

	return Math.abs(wrappedDelta) === Math.PI ? Math.sign(directDelta) * Math.PI : wrappedDelta;
};

export const interpolateNumber = function interpolateNumber(
	start: number,
	end: number,
	progress: number,
	interpolation: Interpolation,
	curve: CubicBezier | null
): number {
	if (interpolation === 'stepped') {
		return start;
	}

	const adjustedProgress = interpolation === 'bezier' && curve
		? evaluateCubicBezier(progress, curve)
		: clamp01(progress);

	return start + (end - start) * adjustedProgress;
};

export const interpolateAngle = function interpolateAngle(
	start: number,
	end: number,
	progress: number,
	interpolation: Interpolation,
	curve: CubicBezier | null
): number {
	const delta = shortestAngleDelta(start, end);

	return interpolateNumber(start, start + delta, progress, interpolation, curve);
};

export const sampleNumberKeys = function sampleNumberKeys(
	keys: readonly NumberKey[],
	timeSeconds: number,
	defaultValue: number,
	angle: boolean = false
): number {
	const orderedKeys = [...keys].sort((left, right) => left.timeSeconds - right.timeSeconds);
	const preceding = orderedKeys.findLast((key) => key.timeSeconds <= timeSeconds);

	if (!preceding) {
		return defaultValue;
	}

	const following = orderedKeys.find((key) => key.timeSeconds > preceding.timeSeconds);

	if (!following) {
		return preceding.value;
	}

	const duration = following.timeSeconds - preceding.timeSeconds;
	const progress = duration > 0 ? (timeSeconds - preceding.timeSeconds) / duration : 0;

	return angle
		? interpolateAngle(preceding.value, following.value, progress, preceding.interpolation, preceding.curve)
		: interpolateNumber(preceding.value, following.value, progress, preceding.interpolation, preceding.curve);
};

export const sampleDiscreteKeys = function sampleDiscreteKeys<TValue>(
	keys: readonly DiscreteKey<TValue>[],
	timeSeconds: number,
	defaultValue: TValue
): TValue {
	const preceding = [...keys]
		.sort((left, right) => left.timeSeconds - right.timeSeconds)
		.findLast((key) => key.timeSeconds <= timeSeconds);

	return preceding ? preceding.value : defaultValue;
};

export const insertKeyByTime = function insertKeyByTime<TValue extends { readonly timeSeconds: number }>(
	keys: readonly TValue[],
	key: TValue
): readonly TValue[] | undefined {
	if (keys.some((candidate) => candidate.timeSeconds === key.timeSeconds)) {
		return undefined;
	}

	return [...keys, key].sort((left, right) => left.timeSeconds - right.timeSeconds);
};
