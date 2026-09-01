import { describe, expect, test } from 'bun:test';
import {
	evaluateCubicBezier,
	insertKeyByTime,
	interpolateAngle,
	interpolateNumber,
	sampleDiscreteKeys,
	sampleNumberKeys,
	shortestAngleDelta
} from '../../src/domain/interpolation.ts';
import type { DiscreteKey, NumberKey } from '../../src/domain/model.ts';

const keyId = '123e4567-e89b-42d3-a456-426614174001';
const secondKeyId = '123e4567-e89b-42d3-a456-426614174002';

const numberKeys: readonly NumberKey[] = [
	{
		id: keyId,
		timeSeconds: 0,
		value: 10,
		interpolation: 'linear',
		curve: null
	},
	{
		id: secondKeyId,
		timeSeconds: 1,
		value: 30,
		interpolation: 'linear',
		curve: null
	}
];

describe('animation interpolation', () => {
	test('samples stepped and linear numeric keys', () => {
		expect(sampleNumberKeys(numberKeys, 0.5, 0)).toBe(20);
		expect(sampleNumberKeys([
			{ ...numberKeys[0], interpolation: 'stepped' },
			numberKeys[1]
		], 0.5, 0)).toBe(10);
		expect(sampleNumberKeys(numberKeys, -1, 99)).toBe(99);
	});

	test('evaluates cubic Bezier progress through its x axis', () => {
		const curve = { x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 } as const;
		const progress = evaluateCubicBezier(0.5, curve);
		const value = interpolateNumber(0, 100, 0.5, 'bezier', curve);

		expect(progress).toBeGreaterThan(0.5);
		expect(value).toBeCloseTo(progress * 100, 6);
	});

	test('interpolates rotation across the shortest boundary', () => {
		const start = 350 * Math.PI / 180;
		const end = 10 * Math.PI / 180;

		expect(shortestAngleDelta(start, end)).toBeCloseTo(20 * Math.PI / 180, 12);
		expect(interpolateAngle(start, end, 0.5, 'linear', null)).toBeCloseTo(2 * Math.PI, 12);
	});

	test('samples discrete values and keeps inserted keys sorted', () => {
		const keys: readonly DiscreteKey<boolean>[] = [
			{ id: secondKeyId, timeSeconds: 1, value: false },
			{ id: keyId, timeSeconds: 0, value: true }
		];
		const inserted = insertKeyByTime(keys, { id: '123e4567-e89b-42d3-a456-426614174003', timeSeconds: 0.5, value: false });

		expect(sampleDiscreteKeys(keys, 0.25, false)).toBe(true);
		expect(sampleDiscreteKeys(keys, 2, true)).toBe(false);
		expect(inserted?.map((key) => key.timeSeconds)).toEqual([0, 0.5, 1]);
		expect(insertKeyByTime(keys, { id: '123e4567-e89b-42d3-a456-426614174004', timeSeconds: 1, value: true })).toBeUndefined();
	});
});
