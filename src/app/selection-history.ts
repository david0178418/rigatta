import type { SelectableEntity, Selection } from './selection.ts';

export const SELECTION_HISTORY_LIMIT = 20;

export type SelectionHistoryState = Readonly<{
	entries: readonly Selection[];
	cursor: number;
}>;

export type SelectionHistoryNavigation = Readonly<{
	state: SelectionHistoryState;
	selection?: Selection;
}>;

const immutableEntity = function immutableEntity(entity: SelectableEntity): SelectableEntity {
	if (entity.kind === 'asset') {
		return Object.freeze({ kind: 'asset', id: entity.id });
	}
	if (entity.kind === 'bone') {
		return Object.freeze({ kind: 'bone', id: entity.id });
	}
	if (entity.kind === 'slot') {
		return Object.freeze({ kind: 'slot', id: entity.id });
	}

	return Object.freeze({ kind: 'attachment', id: entity.id });
};

const immutableSelection = function immutableSelection(selection: Selection): Selection {
	return Object.freeze(selection.map(immutableEntity));
};

const selectionsMatch = function selectionsMatch(left: Selection, right: Selection): boolean {
	return left.length === right.length
		&& left.every((entity, index) => {
			const other = right[index];

			return other?.kind === entity.kind && other.id === entity.id;
		});
};

const immutableHistoryState = function immutableHistoryState(
	entries: readonly Selection[],
	cursor: number
): SelectionHistoryState {
	const boundedEntries = Object.freeze(entries.slice(-SELECTION_HISTORY_LIMIT));
	const boundedCursor = boundedEntries.length === 0
		? -1
		: Math.max(0, Math.min(boundedEntries.length - 1, cursor));

	return Object.freeze({ entries: boundedEntries, cursor: boundedCursor });
};

export const createSelectionHistory = function createSelectionHistory(
	entries: readonly Selection[] = []
): SelectionHistoryState {
	const nonEmptyEntries = entries
		.filter((selection) => selection.length > 0)
		.map(immutableSelection);

	return immutableHistoryState(nonEmptyEntries, nonEmptyEntries.length - 1);
};

export const recordSelectionHistory = function recordSelectionHistory(
	state: SelectionHistoryState,
	selection: Selection
): SelectionHistoryState {
	if (selection.length === 0) {
		return state;
	}

	const nextSelection = immutableSelection(selection);
	const currentSelection = state.entries[state.cursor];

	if (currentSelection && selectionsMatch(currentSelection, nextSelection)) {
		return state;
	}

	const retainedEntries = state.cursor >= 0
		? state.entries.slice(0, state.cursor + 1)
		: state.entries;

	return immutableHistoryState([...retainedEntries, nextSelection], state.cursor + 1);
};

const indexesForDirection = function indexesForDirection(
	state: SelectionHistoryState,
	direction: -1 | 1
): readonly number[] {
	const firstIndex = state.cursor + direction;

	if (direction === -1) {
		return Array.from({ length: Math.max(0, state.cursor) }, (_, offset) => firstIndex - offset);
	}

	return Array.from(
		{ length: Math.max(0, state.entries.length - state.cursor - 1) },
		(_, offset) => firstIndex + offset
	);
};

const validSelectionFor = function validSelectionFor(
	selection: Selection,
	isValid: (entity: SelectableEntity) => boolean
): Selection {
	return immutableSelection(selection.filter(isValid));
};

export const navigateSelectionHistory = function navigateSelectionHistory(
	state: SelectionHistoryState,
	direction: -1 | 1,
	isValid: (entity: SelectableEntity) => boolean
): SelectionHistoryNavigation {
	const nextIndex = indexesForDirection(state, direction).find((index) => (
		validSelectionFor(state.entries[index] ?? [], isValid).length > 0
	));

	if (nextIndex === undefined) {
		return { state };
	}

	const selection = validSelectionFor(state.entries[nextIndex] ?? [], isValid);

	return {
		state: immutableHistoryState(state.entries, nextIndex),
		selection
	};
};

export const canNavigateSelectionHistory = function canNavigateSelectionHistory(
	state: SelectionHistoryState,
	direction: -1 | 1,
	isValid: (entity: SelectableEntity) => boolean
): boolean {
	return indexesForDirection(state, direction).some((index) => (
		validSelectionFor(state.entries[index] ?? [], isValid).length > 0
	));
};
