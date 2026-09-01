import type { LocalTransform } from './coordinates.ts';
import type { EntityId } from './ids.ts';
import {
	addAttachmentKey,
	addBooleanKey,
	addDrawOrderKey,
	addNumberKey,
	createClip,
	createTrack,
	deleteClip,
	deleteKey,
	deleteTrack,
	renameClip,
	updateClipPlayback
} from './animation.ts';
import type {
	AttachmentKeyInput,
	BooleanKeyInput,
	DrawOrderKeyInput,
	NumberKeyInput,
	TrackDefinition
} from './animation.ts';
import {
	createBone,
	createImageAttachment,
	createPointAttachment,
	createRectangleAttachment,
	createSlot,
	deleteAttachment,
	deleteBone,
	deleteSlot,
	renameAttachment,
	renameBone,
	renameProject,
	renameSlot,
	reorderBone,
	reorderSlot,
	reparentBone,
	updateBoneSetupTransform
} from './operations.ts';
import type {
	CreateBoneInput,
	CreateImageAttachmentInput,
	CreatePointAttachmentInput,
	CreateRectangleAttachmentInput,
	CreateSlotInput,
	OperationResult
} from './operations.ts';
import type { Project } from './model.ts';
import { preserveWorldPoseOnReparent } from './transforms.ts';

export type ProjectCommand =
	| Readonly<{ kind: 'rename-project'; name: string }>
	| Readonly<{ kind: 'create-bone'; id: EntityId; input: CreateBoneInput }>
	| Readonly<{ kind: 'rename-bone'; boneId: EntityId; name: string }>
	| Readonly<{ kind: 'delete-bone'; boneId: EntityId }>
	| Readonly<{ kind: 'reparent-bone'; boneId: EntityId; parentId: EntityId | null }>
	| Readonly<{ kind: 'reparent-bone-preserving-world'; boneId: EntityId; parentId: EntityId | null }>
	| Readonly<{ kind: 'reorder-bone'; boneId: EntityId; targetSiblingIndex: number }>
	| Readonly<{ kind: 'update-bone-transform'; boneId: EntityId; transform: LocalTransform }>
	| Readonly<{ kind: 'create-slot'; id: EntityId; input: CreateSlotInput }>
	| Readonly<{ kind: 'rename-slot'; slotId: EntityId; name: string }>
	| Readonly<{ kind: 'delete-slot'; slotId: EntityId }>
	| Readonly<{ kind: 'reorder-slot'; slotId: EntityId; targetIndex: number }>
	| Readonly<{ kind: 'create-image-attachment'; id: EntityId; input: CreateImageAttachmentInput }>
	| Readonly<{ kind: 'create-point-attachment'; id: EntityId; input: CreatePointAttachmentInput }>
	| Readonly<{ kind: 'create-rectangle-attachment'; id: EntityId; input: CreateRectangleAttachmentInput }>
	| Readonly<{ kind: 'rename-attachment'; attachmentId: EntityId; name: string }>
	| Readonly<{ kind: 'delete-attachment'; attachmentId: EntityId }>
	| Readonly<{ kind: 'create-clip'; id: EntityId; input: Readonly<{ name: string; durationSeconds?: number; fps?: number; loop?: boolean }> }>
	| Readonly<{ kind: 'rename-clip'; clipId: EntityId; name: string }>
	| Readonly<{ kind: 'delete-clip'; clipId: EntityId }>
	| Readonly<{ kind: 'update-clip-playback'; clipId: EntityId; settings: Readonly<Partial<{ durationSeconds: number; fps: number; loop: boolean }>> }>
	| Readonly<{ kind: 'create-track'; id: EntityId; clipId: EntityId; definition: TrackDefinition }>
	| Readonly<{ kind: 'delete-track'; clipId: EntityId; trackId: EntityId }>
	| Readonly<{ kind: 'add-number-key'; id: EntityId; clipId: EntityId; trackId: EntityId; input: NumberKeyInput }>
	| Readonly<{ kind: 'add-attachment-key'; id: EntityId; clipId: EntityId; trackId: EntityId; input: AttachmentKeyInput }>
	| Readonly<{ kind: 'add-draw-order-key'; id: EntityId; clipId: EntityId; trackId: EntityId; input: DrawOrderKeyInput }>
	| Readonly<{ kind: 'add-boolean-key'; id: EntityId; clipId: EntityId; trackId: EntityId; input: BooleanKeyInput }>
	| Readonly<{ kind: 'delete-key'; clipId: EntityId; trackId: EntityId; keyId: EntityId }>;

const invalidCommand = function invalidCommand(message: string): OperationResult<never> {
	return { ok: false, error: { code: 'invalid-value', message } };
};

export const reduceProject = function reduceProject(
	project: Project,
	command: ProjectCommand
): OperationResult<Project> {
	if (command.kind === 'rename-project') {
		return renameProject(project, command.name);
	}
	if (command.kind === 'create-bone') {
		return createBone(project, command.input, () => command.id);
	}
	if (command.kind === 'rename-bone') {
		return renameBone(project, command.boneId, command.name);
	}
	if (command.kind === 'delete-bone') {
		return deleteBone(project, command.boneId);
	}
	if (command.kind === 'reparent-bone') {
		return reparentBone(project, command.boneId, command.parentId);
	}
	if (command.kind === 'reparent-bone-preserving-world') {
		return preserveWorldPoseOnReparent(project, command.boneId, command.parentId);
	}
	if (command.kind === 'reorder-bone') {
		return reorderBone(project, command.boneId, command.targetSiblingIndex);
	}
	if (command.kind === 'update-bone-transform') {
		return updateBoneSetupTransform(project, command.boneId, command.transform);
	}
	if (command.kind === 'create-slot') {
		return createSlot(project, command.input, () => command.id);
	}
	if (command.kind === 'rename-slot') {
		return renameSlot(project, command.slotId, command.name);
	}
	if (command.kind === 'delete-slot') {
		return deleteSlot(project, command.slotId);
	}
	if (command.kind === 'reorder-slot') {
		return reorderSlot(project, command.slotId, command.targetIndex);
	}
	if (command.kind === 'create-image-attachment') {
		return createImageAttachment(project, command.input, () => command.id);
	}
	if (command.kind === 'create-point-attachment') {
		return createPointAttachment(project, command.input, () => command.id);
	}
	if (command.kind === 'create-rectangle-attachment') {
		return createRectangleAttachment(project, command.input, () => command.id);
	}
	if (command.kind === 'rename-attachment') {
		return renameAttachment(project, command.attachmentId, command.name);
	}
	if (command.kind === 'delete-attachment') {
		return deleteAttachment(project, command.attachmentId);
	}
	if (command.kind === 'create-clip') {
		return createClip(project, command.input, () => command.id);
	}
	if (command.kind === 'rename-clip') {
		return renameClip(project, command.clipId, command.name);
	}
	if (command.kind === 'delete-clip') {
		return deleteClip(project, command.clipId);
	}
	if (command.kind === 'update-clip-playback') {
		return updateClipPlayback(project, command.clipId, command.settings);
	}
	if (command.kind === 'create-track') {
		return createTrack(project, command.clipId, command.definition, () => command.id);
	}
	if (command.kind === 'delete-track') {
		return deleteTrack(project, command.clipId, command.trackId);
	}
	if (command.kind === 'add-number-key') {
		return addNumberKey(project, command.clipId, command.trackId, command.input, () => command.id);
	}
	if (command.kind === 'add-attachment-key') {
		return addAttachmentKey(project, command.clipId, command.trackId, command.input, () => command.id);
	}
	if (command.kind === 'add-draw-order-key') {
		return addDrawOrderKey(project, command.clipId, command.trackId, command.input, () => command.id);
	}
	if (command.kind === 'add-boolean-key') {
		return addBooleanKey(project, command.clipId, command.trackId, command.input, () => command.id);
	}
	if (command.kind === 'delete-key') {
		return deleteKey(project, command.clipId, command.trackId, command.keyId);
	}

	return invalidCommand('Unknown project command.');
};
