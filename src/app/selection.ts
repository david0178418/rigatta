import type { EntityId } from '../domain/ids.ts';

export type SelectableEntity = Readonly<{
	kind: 'asset' | 'bone' | 'slot' | 'attachment';
	id: EntityId;
}>;

export type Selection = readonly SelectableEntity[];

const sameEntity = function sameEntity(left: SelectableEntity, right: SelectableEntity): boolean {
	return left.kind === right.kind && left.id === right.id;
};

export const createSelection = function createSelection(): Selection {
	return [];
};

export const isSelected = function isSelected(
	selection: Selection,
	entity: SelectableEntity
): boolean {
	return selection.some((candidate) => sameEntity(candidate, entity));
};

export const selectEntity = function selectEntity(
	selection: Selection,
	entity: SelectableEntity,
	additive: boolean = false
): Selection {
	if (!additive) {
		return [entity];
	}

	return isSelected(selection, entity)
		? selection.filter((candidate) => !sameEntity(candidate, entity))
		: [...selection, entity];
};

export const selectEntities = function selectEntities(
	selection: Selection,
	entities: readonly SelectableEntity[],
	additive: boolean = false
): Selection {
	return entities.reduce(
		(current, entity) => isSelected(current, entity) ? current : [...current, entity],
		additive ? selection : createSelection()
	);
};

export const clearSelection = function clearSelection(): Selection {
	return createSelection();
};
