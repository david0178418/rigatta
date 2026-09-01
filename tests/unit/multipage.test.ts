import { describe, expect, test } from 'bun:test';
import { packMaxRectsPages } from '../../src/export/packing.ts';

const items = [
	{ key: 'frame-a', width: 4, height: 4 },
	{ key: 'frame-b', width: 4, height: 4 },
	{ key: 'frame-c', width: 4, height: 4 },
	{ key: 'frame-d', width: 4, height: 4 },
	{ key: 'frame-e', width: 4, height: 4 }
] as const;

describe('multipage atlas packing', () => {
	test('splits items into deterministic pages at the configured size', () => {
		const result = packMaxRectsPages(items, { width: 8, height: 8 });

		if (!result.ok) {
			throw new Error(result.error);
		}

		expect(result.value).toHaveLength(2);
		expect(result.value.flatMap((page) => page.placements.map((placement) => placement.key))).toEqual(['frame-a', 'frame-b', 'frame-c', 'frame-d', 'frame-e']);
		expect(result.value[0]?.placements).toHaveLength(4);
		expect(result.value[1]?.placements).toHaveLength(1);
	});

	test('is independent of input order and rejects items larger than a page', () => {
		const first = packMaxRectsPages(items, { width: 8, height: 8 }, 1);
		const second = packMaxRectsPages([...items].reverse(), { width: 8, height: 8 }, 1);
		const tooLarge = packMaxRectsPages([{ key: 'large', width: 8, height: 8 }], { width: 8, height: 8 }, 1);

		expect(first).toEqual(second);
		expect(tooLarge).toMatchObject({ ok: false });
	});
});
