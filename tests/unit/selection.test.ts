import { describe, expect, test } from 'bun:test';
import { createSelection, isSelected, selectEntities, selectEntity } from '../../src/app/selection.ts';
import {
	canNavigateSelectionHistory,
	createSelectionHistory,
	navigateSelectionHistory,
	recordSelectionHistory,
	SELECTION_HISTORY_LIMIT
} from '../../src/app/selection-history.ts';

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

describe('selection history', () => {
	test('retains full additive selections and ignores identical snapshots', () => {
		const first = createSelectionHistory();
		const second = recordSelectionHistory(first, [bone]);
		const additive = recordSelectionHistory(second, [bone, asset]);
		const unchanged = recordSelectionHistory(additive, [bone, asset]);

		expect(additive.entries).toEqual([[bone], [bone, asset]]);
		expect(additive.entries[1]).not.toBe(additive.entries[0]);
		expect(unchanged).toBe(additive);
		expect(Object.isFrozen(additive)).toBe(true);
		expect(Object.isFrozen(additive.entries)).toBe(true);
		expect(Object.isFrozen(additive.entries[1])).toBe(true);
	});

	test('bounds history and truncates the forward branch after a new selection', () => {
		const history = Array.from({ length: SELECTION_HISTORY_LIMIT + 3 }, (_, index) => ({
			kind: 'bone' as const,
			id: `bone-${index}`
		}));
		const recorded = history.reduce(
			(current, entity) => recordSelectionHistory(current, [entity]),
			createSelectionHistory()
		);
		const previous = navigateSelectionHistory(recorded, -1, () => true);
		const branched = previous.selection
			? recordSelectionHistory(previous.state, [bone])
			: previous.state;

		expect(recorded.entries).toHaveLength(SELECTION_HISTORY_LIMIT);
		expect(recorded.cursor).toBe(SELECTION_HISTORY_LIMIT - 1);
		expect(previous.selection).toEqual([{ kind: 'bone', id: 'bone-21' }]);
		expect(branched.entries.at(-1)).toEqual([bone]);
		expect(canNavigateSelectionHistory(branched, 1, () => true)).toBe(false);
	});

	test('skips removed entities and restores valid members without recording replay', () => {
		const history = recordSelectionHistory(
			recordSelectionHistory(createSelectionHistory(), [bone]),
			[bone, asset]
		);
		const previous = navigateSelectionHistory(
			history,
			-1,
			(entity) => entity.kind !== 'asset'
		);
		const next = navigateSelectionHistory(
			previous.state,
			1,
			(entity) => entity.kind === 'bone'
		);

		expect(previous.selection).toEqual([bone]);
		expect(next.selection).toEqual([bone]);
		expect(history.entries).toEqual([[bone], [bone, asset]]);
		expect(canNavigateSelectionHistory(next.state, 1, () => false)).toBe(false);
	});
});
