import type { ProjectCommand } from '../domain/commands.ts';
import type { EntityId } from '../domain/ids.ts';
import type { Project } from '../domain/model.ts';

export type BoneDropZone = 'before' | 'inside' | 'after';

const isDescendantOf = function isDescendantOf(
	project: Project,
	ancestorId: EntityId,
	potentialDescendantId: EntityId
): boolean {
	const descendant = project.bones.find((bone) => bone.id === potentialDescendantId);

	if (!descendant?.parentId) {
		return false;
	}
	if (descendant.parentId === ancestorId) {
		return true;
	}

	return isDescendantOf(project, ancestorId, descendant.parentId);
};

const siblingIds = function siblingIds(
	project: Project,
	parentId: EntityId | null,
	excludedId: EntityId
): readonly EntityId[] {
	return project.boneOrder.filter((boneId) => {
		const bone = project.bones.find((candidate) => candidate.id === boneId);

		return bone?.parentId === parentId && boneId !== excludedId;
	});
};

export const boneDropCommands = function boneDropCommands(
	project: Project,
	sourceId: EntityId,
	targetId: EntityId,
	zone: BoneDropZone
): readonly ProjectCommand[] | undefined {
	const source = project.bones.find((bone) => bone.id === sourceId);
	const target = project.bones.find((bone) => bone.id === targetId);

	if (!source || !target || sourceId === targetId) {
		return undefined;
	}

	const nextParentId = zone === 'inside' ? target.id : target.parentId;

	if (nextParentId === sourceId || isDescendantOf(project, sourceId, nextParentId ?? sourceId)) {
		return undefined;
	}

	const nextSiblings = siblingIds(project, nextParentId, sourceId);
	const targetIndex = zone === 'inside'
		? nextSiblings.length
		: nextSiblings.indexOf(target.id) + (zone === 'after' ? 1 : 0);

	if (zone !== 'inside' && !nextSiblings.includes(target.id)) {
		return undefined;
	}

	const reparent = source.parentId === nextParentId
		? []
		: [{ kind: 'reparent-bone-preserving-world' as const, boneId: sourceId, parentId: nextParentId }];

	return [
		...reparent,
		{ kind: 'reorder-bone', boneId: sourceId, targetSiblingIndex: targetIndex }
	];
};

export const dropZoneForClientY = function dropZoneForClientY(
	top: number,
	height: number,
	clientY: number
): BoneDropZone {
	const relativeY = height > 0 ? (clientY - top) / height : 0.5;

	return relativeY < 0.25 ? 'before' : relativeY > 0.75 ? 'after' : 'inside';
};
