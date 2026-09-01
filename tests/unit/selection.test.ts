import { describe, expect, test } from 'bun:test';
import { createSelection, isSelected, selectEntities, selectEntity } from '../../src/app/selection.ts';

const bone = { kind: 'bone', id: '123e4567-e89b-42d3-a456-426614174001' } as const;
const asset = { kind: 'asset', id: '123e4567-e89b-42d3-a456-426614174002' } as const;

describe('selection state', () => {
	test('replaces and toggles selection immutably', () => {
		const first = selectEntity(createSelection(), bone);
		const added = selectEntity(first, asset, true);
		const toggled = selectEntity(added, bone, true);

		expect(first).toEqual([bone]);
		expect(added).toEqual([bone, asset]);
		expect(toggled).toEqual([asset]);
		expect(isSelected(added, bone)).toBe(true);
	});

	test('selects a marquee result with deterministic order', () => {
		expect(selectEntities([asset], [bone, bone], false)).toEqual([bone]);
		expect(selectEntities([asset], [bone], true)).toEqual([asset, bone]);
	});
});
