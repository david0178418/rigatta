import type { EntityId } from '../domain/ids.ts';
import type { Project } from '../domain/model.ts';

const boneIsHidden = function boneIsHidden(
	project: Project,
	boneId: EntityId,
	hiddenIds: ReadonlySet<EntityId>,
	visited: ReadonlySet<EntityId> = new Set<EntityId>()
): boolean {
	if (hiddenIds.has(boneId) || visited.has(boneId)) {
		return hiddenIds.has(boneId);
	}

	const bone = project.bones.find((candidate) => candidate.id === boneId);

	return bone?.parentId
		? boneIsHidden(project, bone.parentId, hiddenIds, new Set([...visited, boneId]))
		: false;
};

const owningBoneId = function owningBoneId(project: Project, entityId: EntityId): EntityId | undefined {
	const bone = project.bones.find((candidate) => candidate.id === entityId);

	if (bone) {
		return bone.id;
	}

	const attachment = project.attachments.find((candidate) => candidate.id === entityId);

	return attachment?.kind === 'image'
		? project.slots.find((slot) => slot.id === attachment.slotId)?.boneId
		: attachment?.boneId;
};

export const isEditorEntityVisible = function isEditorEntityVisible(
	project: Project,
	entityId: EntityId,
	hiddenIds: ReadonlySet<EntityId>
): boolean {
	if (hiddenIds.has(entityId)) {
		return false;
	}

	const boneId = owningBoneId(project, entityId);

	return boneId ? !boneIsHidden(project, boneId, hiddenIds) : true;
};
