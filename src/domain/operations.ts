import {
	DEFAULT_LOCAL_TRANSFORM,
	isFiniteLocalTransform,
	type LocalTransform
} from './coordinates.ts';
import { createEntityId, isEntityId, type EntityId } from './ids.ts';
import { isSupportedImageMimeType } from './schema.ts';
import type {
	Attachment,
	Bone,
	ImageAttachment,
	ImageAsset,
	PointAttachment,
	Project,
	RectangleAttachment,
	Slot
} from './model.ts';

export type OperationCode =
	| 'not-found'
	| 'invalid-name'
	| 'invalid-reference'
	| 'duplicate-id'
	| 'invalid-id'
	| 'invalid-value'
	| 'duplicate-asset-path'
	| 'has-dependents'
	| 'cannot-delete-root'
	| 'hierarchy-cycle'
	| 'invalid-order'
	| 'invalid-pose';

export type OperationError = Readonly<{
	code: OperationCode;
	message: string;
}>;

export type OperationResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: OperationError }>;

export type CreateBoneInput = Readonly<{
	name: string;
	parentId: EntityId | null;
	transform?: LocalTransform;
}>;

export type CreateSlotInput = Readonly<{
	name: string;
	boneId: EntityId;
}>;

export type CreateImageAssetInput = Readonly<Omit<ImageAsset, 'id'>>;

export type CreateImageAssetCommandInput = Readonly<{
	id: EntityId;
	asset: CreateImageAssetInput;
}>;

export type CreateImageAttachmentInput = Readonly<{
	name: string;
	slotId: EntityId;
	assetId: EntityId;
	transform?: LocalTransform;
	opacity?: number;
	pivotX?: number;
	pivotY?: number;
}>;

export type CreatePointAttachmentInput = Readonly<{
	name: string;
	boneId: EntityId;
	transform?: LocalTransform;
	enabled?: boolean;
}>;

export type CreateRectangleAttachmentInput = Readonly<{
	name: string;
	boneId: EntityId;
	width: number;
	height: number;
	transform?: LocalTransform;
	enabled?: boolean;
}>;

const success = function success<TValue>(value: TValue): OperationResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(
	code: OperationCode,
	message: string
): OperationResult<never> {
	return { ok: false, error: { code, message } };
};

const invalidName = function invalidName(name: string): OperationResult<string> {
	const normalizedName = name.trim();

	return normalizedName.length > 0
		? success(normalizedName)
		: failure('invalid-name', 'Names must contain at least one non-whitespace character.');
};

const allEntityIds = function allEntityIds(project: Project): readonly EntityId[] {
	return [
		project.id,
		...project.assets.map((asset) => asset.id),
		...project.bones.map((bone) => bone.id),
		...project.slots.map((slot) => slot.id),
		...project.attachments.map((attachment) => attachment.id),
		...project.clips.map((clip) => clip.id),
		...project.clips.flatMap((clip) => [
			...clip.tracks.map((track) => track.id),
			...clip.tracks.flatMap((track) => track.keys.map((key) => key.id)),
			...clip.events.map((event) => event.id)
		])
	];
};

const allocateId = function allocateId(
	project: Project,
	idFactory: () => EntityId
): OperationResult<EntityId> {
	const id = idFactory();

	if (!isEntityId(id)) {
		return failure('invalid-id', 'Entity ID factories must return UUID v4 IDs.');
	}
	if (allEntityIds(project).includes(id)) {
		return failure('duplicate-id', 'Generated entity ID is already in use.');
	}

	return success(id);
};

const findBone = function findBone(project: Project, id: EntityId): Bone | undefined {
	return project.bones.find((bone) => bone.id === id);
};

const findSlot = function findSlot(project: Project, id: EntityId): Slot | undefined {
	return project.slots.find((slot) => slot.id === id);
};

const findAttachment = function findAttachment(
	project: Project,
	id: EntityId
): Attachment | undefined {
	return project.attachments.find((attachment) => attachment.id === id);
};

const hasTrackTarget = function hasTrackTarget(project: Project, targetId: EntityId): boolean {
	return project.clips.some((clip) => clip.tracks.some((track) => track.kind === 'slot-draw-order'
		? track.keys.some((key) => key.value.includes(targetId))
		: track.targetId === targetId));
};

const hasBoneChildren = function hasBoneChildren(project: Project, boneId: EntityId): boolean {
	return project.bones.some((bone) => bone.parentId === boneId);
};

const hasBoneDependents = function hasBoneDependents(project: Project, boneId: EntityId): boolean {
	return project.slots.some((slot) => slot.boneId === boneId)
		|| project.attachments.some((attachment) => attachment.kind !== 'image' && attachment.boneId === boneId)
		|| hasTrackTarget(project, boneId);
};

const isUnitInterval = function isUnitInterval(value: number): boolean {
	return Number.isFinite(value) && value >= 0 && value <= 1;
};

const isPositiveFinite = function isPositiveFinite(value: number): boolean {
	return Number.isFinite(value) && value > 0;
};

const isSafeRelativePath = function isSafeRelativePath(path: string): boolean {
	const normalizedPath = path.replaceAll('\\', '/');
	const segments = normalizedPath.split('/');

	return normalizedPath.length > 0
		&& !normalizedPath.startsWith('/')
		&& !segments.some((segment) => segment === '..')
		&& segments.every((segment) => segment.length > 0 && segment !== '.');
};

const updateBone = function updateBone(
	project: Project,
	boneId: EntityId,
	update: (bone: Bone) => Bone
): OperationResult<Project> {
	if (!findBone(project, boneId)) {
		return failure('not-found', 'Bone does not exist.');
	}

	return success({
		...project,
		bones: project.bones.map((bone) => bone.id === boneId ? update(bone) : bone)
	});
};

const updateSlot = function updateSlot(
	project: Project,
	slotId: EntityId,
	update: (slot: Slot) => Slot
): OperationResult<Project> {
	if (!findSlot(project, slotId)) {
		return failure('not-found', 'Slot does not exist.');
	}

	return success({
		...project,
		slots: project.slots.map((slot) => slot.id === slotId ? update(slot) : slot)
	});
};

const updateAttachment = function updateAttachment(
	project: Project,
	attachmentId: EntityId,
	update: (attachment: Attachment) => Attachment
): OperationResult<Project> {
	if (!findAttachment(project, attachmentId)) {
		return failure('not-found', 'Attachment does not exist.');
	}

	return success({
		...project,
		attachments: project.attachments.map((attachment) => attachment.id === attachmentId
			? update(attachment)
			: attachment)
	});
};

const isDescendantOf = function isDescendantOf(
	project: Project,
	ancestorId: EntityId,
	potentialDescendantId: EntityId
): boolean {
	const potentialDescendant = findBone(project, potentialDescendantId);

	if (!potentialDescendant || potentialDescendant.parentId === null) {
		return false;
	}
	if (potentialDescendant.parentId === ancestorId) {
		return true;
	}

	return isDescendantOf(project, ancestorId, potentialDescendant.parentId);
};

const validateParentChange = function validateParentChange(
	project: Project,
	boneId: EntityId,
	parentId: EntityId | null
): OperationResult<null> {
	if (!findBone(project, boneId)) {
		return failure('not-found', 'Bone does not exist.');
	}
	if (parentId !== null && !findBone(project, parentId)) {
		return failure('invalid-reference', 'New bone parent does not exist.');
	}
	if (parentId === boneId || (parentId !== null && isDescendantOf(project, boneId, parentId))) {
		return failure('hierarchy-cycle', 'A bone cannot be parented to itself or one of its descendants.');
	}

	return success(null);
};

const hasExactlyOneRootAfterChange = function hasExactlyOneRootAfterChange(
	project: Project,
	boneId: EntityId,
	parentId: EntityId | null
): boolean {
	return project.bones.filter((bone) => (bone.id === boneId ? parentId : bone.parentId) === null).length === 1;
};

export const createBone = function createBone(
	project: Project,
	input: CreateBoneInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const name = invalidName(input.name);

	if (!name.ok) {
		return name;
	}
	if (input.parentId !== null && !findBone(project, input.parentId)) {
		return failure('invalid-reference', 'New bone parent does not exist.');
	}
	if (input.parentId === null && project.bones.some((bone) => bone.parentId === null)) {
		return failure('invalid-reference', 'A project can contain only one root bone.');
	}
	const transform = input.transform ?? DEFAULT_LOCAL_TRANSFORM;

	if (!isFiniteLocalTransform(transform)) {
		return failure('invalid-value', 'Bone transforms must contain finite numbers.');
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	const bone: Bone = {
		id: id.value,
		name: name.value,
		parentId: input.parentId,
		transform
	};

	return success({ ...project, bones: [...project.bones, bone], boneOrder: [...project.boneOrder, bone.id] });
};

export const renameProject = function renameProject(
	project: Project,
	name: string
): OperationResult<Project> {
	const normalizedName = invalidName(name);

	if (!normalizedName.ok) {
		return normalizedName;
	}

	return success({ ...project, name: normalizedName.value });
};

export const createImageAsset = function createImageAsset(
	project: Project,
	input: CreateImageAssetInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const name = invalidName(input.name);

	if (!name.ok) {
		return name;
	}
	if (!isSafeRelativePath(input.relativePath)) {
		return failure('invalid-value', 'Asset paths must be safe, non-empty relative paths.');
	}
	if (!isSupportedImageMimeType(input.mimeType)) {
		return failure('invalid-value', 'Asset MIME type is not supported.');
	}
	if (!Number.isInteger(input.width) || !Number.isInteger(input.height) || !isPositiveFinite(input.width) || !isPositiveFinite(input.height)) {
		return failure('invalid-value', 'Asset dimensions must be positive integers.');
	}
	if (project.assets.some((asset) => asset.relativePath === input.relativePath)) {
		return failure('duplicate-asset-path', 'An asset with this relative path already exists.');
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	const asset: ImageAsset = { ...input, id: id.value, name: name.value };

	return success({ ...project, assets: [...project.assets, asset] });
};

export const createImageAssets = function createImageAssets(
	project: Project,
	inputs: readonly CreateImageAssetCommandInput[]
): OperationResult<Project> {
	return inputs.reduce<OperationResult<Project>>((current, input) => {
		if (!current.ok) {
			return current;
		}

		return createImageAsset(current.value, input.asset, () => input.id);
	}, success(project));
};

export const createSlot = function createSlot(
	project: Project,
	input: CreateSlotInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const name = invalidName(input.name);

	if (!name.ok) {
		return name;
	}
	if (!findBone(project, input.boneId)) {
		return failure('invalid-reference', 'Slot bone does not exist.');
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	const slot: Slot = {
		id: id.value,
		name: name.value,
		boneId: input.boneId,
		setupAttachmentId: null
	};

	return success({
		...project,
		slots: [...project.slots, slot],
		setupDrawOrder: [...project.setupDrawOrder, slot.id]
	});
};

export const createImageAttachment = function createImageAttachment(
	project: Project,
	input: CreateImageAttachmentInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const name = invalidName(input.name);

	if (!name.ok) {
		return name;
	}
	if (!findSlot(project, input.slotId)) {
		return failure('invalid-reference', 'Image attachment slot does not exist.');
	}
	if (!project.assets.some((asset) => asset.id === input.assetId)) {
		return failure('invalid-reference', 'Image attachment asset does not exist.');
	}
	const opacity = input.opacity ?? 1;
	const pivotX = input.pivotX ?? 0.5;
	const pivotY = input.pivotY ?? 0.5;

	if (!isUnitInterval(opacity) || !isUnitInterval(pivotX) || !isUnitInterval(pivotY)) {
		return failure('invalid-value', 'Image opacity and pivots must be within [0, 1].');
	}
	const transform = input.transform ?? DEFAULT_LOCAL_TRANSFORM;

	if (!isFiniteLocalTransform(transform)) {
		return failure('invalid-value', 'Attachment transforms must contain finite numbers.');
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	const attachment: ImageAttachment = {
		id: id.value,
		kind: 'image',
		name: name.value,
		slotId: input.slotId,
		assetId: input.assetId,
		transform,
		opacity,
		pivotX,
		pivotY
	};

	return success({ ...project, attachments: [...project.attachments, attachment] });
};

export const assignSlotAttachment = function assignSlotAttachment(
	project: Project,
	slotId: EntityId,
	attachmentId: EntityId | null
): OperationResult<Project> {
	const slot = findSlot(project, slotId);

	if (!slot) {
		return failure('not-found', 'Slot does not exist.');
	}
	if (attachmentId !== null) {
		const attachment = findAttachment(project, attachmentId);

		if (!attachment || attachment.kind !== 'image' || attachment.slotId !== slotId) {
			return failure('invalid-reference', 'Setup attachment must be an image belonging to the slot.');
		}
	}

	return updateSlot(project, slotId, (current) => ({ ...current, setupAttachmentId: attachmentId }));
};

export const createPointAttachment = function createPointAttachment(
	project: Project,
	input: CreatePointAttachmentInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const name = invalidName(input.name);

	if (!name.ok) {
		return name;
	}
	if (!findBone(project, input.boneId)) {
		return failure('invalid-reference', 'Point attachment bone does not exist.');
	}
	const transform = input.transform ?? DEFAULT_LOCAL_TRANSFORM;

	if (!isFiniteLocalTransform(transform)) {
		return failure('invalid-value', 'Attachment transforms must contain finite numbers.');
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	const attachment: PointAttachment = {
		id: id.value,
		kind: 'point',
		name: name.value,
		boneId: input.boneId,
		transform,
		enabled: input.enabled ?? true
	};

	return success({ ...project, attachments: [...project.attachments, attachment] });
};

export const createRectangleAttachment = function createRectangleAttachment(
	project: Project,
	input: CreateRectangleAttachmentInput,
	idFactory: () => EntityId = createEntityId
): OperationResult<Project> {
	const name = invalidName(input.name);

	if (!name.ok) {
		return name;
	}
	if (!findBone(project, input.boneId)) {
		return failure('invalid-reference', 'Rectangle attachment bone does not exist.');
	}
	if (!isPositiveFinite(input.width) || !isPositiveFinite(input.height)) {
		return failure('invalid-value', 'Rectangle dimensions must be positive finite numbers.');
	}
	const transform = input.transform ?? DEFAULT_LOCAL_TRANSFORM;

	if (!isFiniteLocalTransform(transform)) {
		return failure('invalid-value', 'Attachment transforms must contain finite numbers.');
	}

	const id = allocateId(project, idFactory);

	if (!id.ok) {
		return id;
	}

	const attachment: RectangleAttachment = {
		id: id.value,
		kind: 'rectangle',
		name: name.value,
		boneId: input.boneId,
		transform,
		width: input.width,
		height: input.height,
		enabled: input.enabled ?? true
	};

	return success({ ...project, attachments: [...project.attachments, attachment] });
};

export const renameBone = function renameBone(
	project: Project,
	boneId: EntityId,
	name: string
): OperationResult<Project> {
	const normalizedName = invalidName(name);

	if (!normalizedName.ok) {
		return normalizedName;
	}

	return updateBone(project, boneId, (bone) => ({ ...bone, name: normalizedName.value }));
};

export const renameSlot = function renameSlot(
	project: Project,
	slotId: EntityId,
	name: string
): OperationResult<Project> {
	const normalizedName = invalidName(name);

	if (!normalizedName.ok) {
		return normalizedName;
	}

	return updateSlot(project, slotId, (slot) => ({ ...slot, name: normalizedName.value }));
};

export const renameAttachment = function renameAttachment(
	project: Project,
	attachmentId: EntityId,
	name: string
): OperationResult<Project> {
	const normalizedName = invalidName(name);

	if (!normalizedName.ok) {
		return normalizedName;
	}

	return updateAttachment(project, attachmentId, (attachment) => ({
		...attachment,
		name: normalizedName.value
	}));
};

export const deleteBone = function deleteBone(
	project: Project,
	boneId: EntityId
): OperationResult<Project> {
	const bone = findBone(project, boneId);

	if (!bone) {
		return failure('not-found', 'Bone does not exist.');
	}
	if (bone.parentId === null && project.bones.length === 1) {
		return failure('cannot-delete-root', 'A project must retain a root bone.');
	}
	if (hasBoneChildren(project, boneId) || hasBoneDependents(project, boneId)) {
		return failure('has-dependents', 'Remove child bones, slots, attachments, and keys before deleting this bone.');
	}

	return success({
		...project,
		bones: project.bones.filter((candidate) => candidate.id !== boneId),
		boneOrder: project.boneOrder.filter((candidate) => candidate !== boneId)
	});
};

export const deleteSlot = function deleteSlot(
	project: Project,
	slotId: EntityId
): OperationResult<Project> {
	if (!findSlot(project, slotId)) {
		return failure('not-found', 'Slot does not exist.');
	}
	if (project.attachments.some((attachment) => attachment.kind === 'image' && attachment.slotId === slotId)) {
		return failure('has-dependents', 'Remove the slot image attachments before deleting the slot.');
	}
	if (hasTrackTarget(project, slotId)) {
		return failure('has-dependents', 'Remove slot animation tracks before deleting the slot.');
	}

	return success({
		...project,
		slots: project.slots.filter((slot) => slot.id !== slotId),
		setupDrawOrder: project.setupDrawOrder.filter((candidate) => candidate !== slotId)
	});
};

export const deleteAttachment = function deleteAttachment(
	project: Project,
	attachmentId: EntityId
): OperationResult<Project> {
	if (!findAttachment(project, attachmentId)) {
		return failure('not-found', 'Attachment does not exist.');
	}
	if (project.slots.some((slot) => slot.setupAttachmentId === attachmentId)) {
		return failure('has-dependents', 'Assign another setup attachment before deleting this attachment.');
	}
	if (hasTrackTarget(project, attachmentId)) {
		return failure('has-dependents', 'Remove attachment animation tracks before deleting the attachment.');
	}

	return success({
		...project,
		attachments: project.attachments.filter((attachment) => attachment.id !== attachmentId)
	});
};

export const reparentBone = function reparentBone(
	project: Project,
	boneId: EntityId,
	parentId: EntityId | null
): OperationResult<Project> {
	const parentValidation = validateParentChange(project, boneId, parentId);

	if (!parentValidation.ok) {
		return parentValidation;
	}
	if (!hasExactlyOneRootAfterChange(project, boneId, parentId)) {
		return failure('invalid-reference', 'Reparenting must leave exactly one root bone.');
	}

	return updateBone(project, boneId, (bone) => ({ ...bone, parentId }));
};

const reorderValues = function reorderValues<TValue>(
	values: readonly TValue[],
	value: TValue,
	targetIndex: number
): readonly TValue[] | undefined {
	const withoutValue = values.filter((candidate) => candidate !== value);

	if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > withoutValue.length) {
		return undefined;
	}

	return [
		...withoutValue.slice(0, targetIndex),
		value,
		...withoutValue.slice(targetIndex)
	];
};

export const reorderBone = function reorderBone(
	project: Project,
	boneId: EntityId,
	targetSiblingIndex: number
): OperationResult<Project> {
	const bone = findBone(project, boneId);

	if (!bone) {
		return failure('not-found', 'Bone does not exist.');
	}

	const siblingIds = project.boneOrder.filter((candidateId) => {
		const candidate = findBone(project, candidateId);
		return candidate?.parentId === bone.parentId && candidateId !== boneId;
	});
	const reorderedSiblings = reorderValues(siblingIds, boneId, targetSiblingIndex);

	if (!reorderedSiblings) {
		return failure('invalid-order', 'Bone sibling index is outside the valid range.');
	}

	const siblingPositions = project.boneOrder.filter((candidateId) => (
		candidateId === boneId || siblingIds.includes(candidateId)
	));
const nextBoneOrder = project.boneOrder.map((candidateId) => {
		const siblingPosition = siblingPositions.indexOf(candidateId);
		return siblingPosition < 0 ? candidateId : reorderedSiblings[siblingPosition] ?? candidateId;
	});

	return success({ ...project, boneOrder: nextBoneOrder });
};

export const reorderSlot = function reorderSlot(
	project: Project,
	slotId: EntityId,
	targetIndex: number
): OperationResult<Project> {
	if (!findSlot(project, slotId)) {
		return failure('not-found', 'Slot does not exist.');
	}

	const setupDrawOrder = reorderValues(project.setupDrawOrder, slotId, targetIndex);

	return setupDrawOrder
		? success({ ...project, setupDrawOrder })
		: failure('invalid-order', 'Slot draw-order index is outside the valid range.');
};

export const updateBoneSetupTransform = function updateBoneSetupTransform(
	project: Project,
	boneId: EntityId,
	transform: LocalTransform
): OperationResult<Project> {
	if (!findBone(project, boneId)) {
		return failure('not-found', 'Bone does not exist.');
	}
	if (!isFiniteLocalTransform(transform)) {
		return failure('invalid-value', 'Bone transforms must contain finite numbers.');
	}

	return success({
		...project,
		bones: project.bones.map((bone) => bone.id === boneId ? { ...bone, transform } : bone)
	});
};

export const updateAttachmentSetupTransform = function updateAttachmentSetupTransform(
	project: Project,
	attachmentId: EntityId,
	transform: LocalTransform
): OperationResult<Project> {
	if (!findAttachment(project, attachmentId)) {
		return failure('not-found', 'Attachment does not exist.');
	}
	if (!isFiniteLocalTransform(transform)) {
		return failure('invalid-value', 'Attachment transforms must contain finite numbers.');
	}

	return success({
		...project,
		attachments: project.attachments.map((attachment) => attachment.id === attachmentId
			? { ...attachment, transform }
			: attachment)
	});
};

export const updateImageAttachmentProperties = function updateImageAttachmentProperties(
	project: Project,
	attachmentId: EntityId,
	properties: Readonly<Partial<Pick<ImageAttachment, 'opacity' | 'pivotX' | 'pivotY'>>>
): OperationResult<Project> {
	const attachment = findAttachment(project, attachmentId);

	if (!attachment) {
		return failure('not-found', 'Attachment does not exist.');
	}
	if (attachment.kind !== 'image') {
		return failure('invalid-value', 'Only image attachments have opacity and pivots.');
	}

	const next = { ...attachment, ...properties };

	if (!isUnitInterval(next.opacity) || !isUnitInterval(next.pivotX) || !isUnitInterval(next.pivotY)) {
		return failure('invalid-value', 'Image opacity and pivots must be within [0, 1].');
	}

	return success({
		...project,
		attachments: project.attachments.map((candidate) => candidate.id === attachmentId ? next : candidate)
	});
};

export const updateRectangleAttachmentSize = function updateRectangleAttachmentSize(
	project: Project,
	attachmentId: EntityId,
	width: number,
	height: number
): OperationResult<Project> {
	const attachment = findAttachment(project, attachmentId);

	if (!attachment) {
		return failure('not-found', 'Attachment does not exist.');
	}
	if (attachment.kind !== 'rectangle') {
		return failure('invalid-value', 'Only rectangle attachments have editable dimensions.');
	}
	if (!isPositiveFinite(width) || !isPositiveFinite(height)) {
		return failure('invalid-value', 'Rectangle dimensions must be positive finite numbers.');
	}

	return success({
		...project,
		attachments: project.attachments.map((candidate) => candidate.id === attachmentId
			? { ...candidate, width, height }
			: candidate)
	});
};

export const updatePointAttachmentEnabled = function updatePointAttachmentEnabled(
	project: Project,
	attachmentId: EntityId,
	enabled: boolean
): OperationResult<Project> {
	const attachment = findAttachment(project, attachmentId);

	if (!attachment) {
		return failure('not-found', 'Attachment does not exist.');
	}
	if (attachment.kind !== 'point') {
		return failure('invalid-value', 'Only point attachments have point enabled state.');
	}
	if (typeof enabled !== 'boolean') {
		return failure('invalid-value', 'Point enabled state must be boolean.');
	}

	return success({
		...project,
		attachments: project.attachments.map((candidate) => candidate.id === attachmentId
			? { ...candidate, enabled }
			: candidate)
	});
};

export const updateRectangleAttachmentEnabled = function updateRectangleAttachmentEnabled(
	project: Project,
	attachmentId: EntityId,
	enabled: boolean
): OperationResult<Project> {
	const attachment = findAttachment(project, attachmentId);

	if (!attachment) {
		return failure('not-found', 'Attachment does not exist.');
	}
	if (attachment.kind !== 'rectangle') {
		return failure('invalid-value', 'Only rectangle attachments have rectangle enabled state.');
	}
	if (typeof enabled !== 'boolean') {
		return failure('invalid-value', 'Rectangle enabled state must be boolean.');
	}

	return success({
		...project,
		attachments: project.attachments.map((candidate) => candidate.id === attachmentId
			? { ...candidate, enabled }
			: candidate)
	});
};
