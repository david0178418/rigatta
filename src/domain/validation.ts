import { isFiniteLocalTransform } from './coordinates.ts';
import { isEntityId, type EntityId } from './ids.ts';
import type {
	Attachment,
	Bone,
	Clip,
	NumberKey,
	Project,
	RectangleAttachment,
	Slot,
	Track
} from './model.ts';
import { isSupportedImageMimeType, PROJECT_SCHEMA_VERSION } from './schema.ts';

export type ValidationCode =
	| 'invalid-schema-version'
	| 'invalid-id'
	| 'duplicate-id'
	| 'invalid-name'
	| 'invalid-canvas'
	| 'invalid-transform'
	| 'missing-reference'
	| 'multiple-roots'
	| 'bone-cycle'
	| 'invalid-bone-order'
	| 'invalid-setup-draw-order'
	| 'invalid-attachment'
	| 'invalid-asset'
	| 'invalid-clip-settings'
	| 'invalid-key'
	| 'invalid-track-target'
	| 'duplicate-track';

export type ValidationDiagnostic = Readonly<{
	code: ValidationCode;
	path: string;
	message: string;
}>;

const diagnostic = function diagnostic(
	code: ValidationCode,
	path: string,
	message: string
): ValidationDiagnostic {
	return { code, path, message };
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

const hasDuplicateValues = function hasDuplicateValues<TValue>(values: readonly TValue[]): boolean {
	return values.some((value, index) => values.indexOf(value) !== index);
};

const validateIds = function validateIds(project: Project): readonly ValidationDiagnostic[] {
	const ids = [
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
	const invalidIds = ids.filter((id) => !isEntityId(id));
	const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);

	return [
		...invalidIds.map((id) => diagnostic('invalid-id', 'id', `Invalid entity ID: ${id}`)),
		...duplicateIds.map((id) => diagnostic('duplicate-id', 'id', `Duplicate entity ID: ${id}`))
	];
};

const validateBasicFields = function validateBasicFields(
	project: Project
): readonly ValidationDiagnostic[] {
	const canvasIsValid = [project.logicalCanvas.width, project.logicalCanvas.height]
		.every((value) => Number.isFinite(value) && value > 0);
	const names = [
		project.name,
		...project.assets.map((asset) => asset.name),
		...project.bones.map((bone) => bone.name),
		...project.slots.map((slot) => slot.name),
		...project.attachments.map((attachment) => attachment.name),
		...project.clips.map((clip) => clip.name)
	];
	const transforms = [
		...project.bones.map((bone) => bone.transform),
		...project.attachments.map((attachment) => attachment.transform)
	];

	return [
		...(project.schemaVersion !== PROJECT_SCHEMA_VERSION
			? [diagnostic('invalid-schema-version', 'schemaVersion', 'Unsupported project schema version.')]
			: []),
		...(canvasIsValid ? [] : [diagnostic('invalid-canvas', 'logicalCanvas', 'Canvas dimensions must be positive finite numbers.')]),
		...names.flatMap((name, index) => typeof name === 'string' && name.trim().length > 0
			? []
			: [diagnostic('invalid-name', `names[${index}]`, 'Names must be non-empty strings.')]),
		...transforms.flatMap((transform, index) => isFiniteLocalTransform(transform)
			? []
			: [diagnostic('invalid-transform', `transforms[${index}]`, 'Transforms must contain finite numbers.')]),
		...project.assets.flatMap((asset, index) => {
			const dimensionsAreValid = [asset.width, asset.height]
				.every((value) => Number.isFinite(value) && value > 0);
			return isSupportedImageMimeType(asset.mimeType) && dimensionsAreValid
				? []
				: [diagnostic('invalid-asset', `assets[${index}]`, 'Image assets need a supported MIME type and positive dimensions.')];
		}),
		...project.attachments.flatMap((attachment, index) => {
			const imageIsValid = attachment.kind !== 'image'
				|| ([attachment.opacity, attachment.pivotX, attachment.pivotY].every(Number.isFinite)
					&& attachment.opacity >= 0
					&& attachment.opacity <= 1
					&& attachment.pivotX >= 0
					&& attachment.pivotX <= 1
					&& attachment.pivotY >= 0
					&& attachment.pivotY <= 1);
			const rectangleIsValid = attachment.kind !== 'rectangle'
				|| ([attachment.width, attachment.height].every(Number.isFinite)
					&& attachment.width > 0
					&& attachment.height > 0);
			return imageIsValid && rectangleIsValid
				? []
				: [diagnostic('invalid-attachment', `attachments[${index}]`, 'Attachment dimensions and normalized values are invalid.')];
		})
	];
};

const validateBoneHierarchy = function validateBoneHierarchy(
	project: Project
): readonly ValidationDiagnostic[] {
	const roots = project.bones.filter((bone) => bone.parentId === null);
	const rootDiagnostic = roots.length === 1
		? []
		: [diagnostic('multiple-roots', 'bones', 'A rig must contain exactly one root bone.')];
	const missingParents = project.bones.flatMap((bone, index) => {
		if (bone.parentId === null || findBone(project, bone.parentId)) {
			return [];
		}

		return [diagnostic('missing-reference', `bones[${index}].parentId`, 'Bone parent does not exist.')];
	});
const hasCycleFrom = function hasCycleFrom(
	bone: Bone,
	ancestors: ReadonlySet<EntityId>
): boolean {
		if (ancestors.has(bone.id)) {
			return true;
		}
		if (bone.parentId === null) {
			return false;
		}
		const parent = findBone(project, bone.parentId);

		return parent ? hasCycleFrom(parent, new Set([...ancestors, bone.id])) : false;
	};
	const cycleDiagnostics = project.bones.flatMap((bone, index) => hasCycleFrom(bone, new Set())
		? [diagnostic('bone-cycle', `bones[${index}]`, 'Bone hierarchy contains a cycle.')]
		: []);

	return [...rootDiagnostic, ...missingParents, ...cycleDiagnostics];
};

const validateReferences = function validateReferences(
	project: Project
): readonly ValidationDiagnostic[] {
	const assetIds = new Set(project.assets.map((asset) => asset.id));
	const boneIds = new Set(project.bones.map((bone) => bone.id));
	const slotIds = new Set(project.slots.map((slot) => slot.id));
	const attachmentIds = new Set(project.attachments.map((attachment) => attachment.id));
	const slotDiagnostics = project.slots.flatMap((slot, index) => {
		const boneReference = boneIds.has(slot.boneId)
			? []
			: [diagnostic('missing-reference', `slots[${index}].boneId`, 'Slot bone does not exist.')];
		const setupAttachment = slot.setupAttachmentId === null
			? undefined
			: findAttachment(project, slot.setupAttachmentId);
		const setupReference = slot.setupAttachmentId === null || (
			setupAttachment?.kind === 'image' && setupAttachment.slotId === slot.id
		)
			? []
			: [diagnostic('invalid-attachment', `slots[${index}].setupAttachmentId`, 'Setup attachment must be an image attachment belonging to the slot.')];

		return [...boneReference, ...setupReference];
	});
	const attachmentDiagnostics = project.attachments.flatMap((attachment, index) => {
		if (attachment.kind === 'image') {
			const assetReference = assetIds.has(attachment.assetId)
				? []
				: [diagnostic('missing-reference', `attachments[${index}].assetId`, 'Image asset does not exist.')];
			const slot = findSlot(project, attachment.slotId);
			const slotReference = slot && slotIds.has(attachment.slotId)
				? []
				: [diagnostic('missing-reference', `attachments[${index}].slotId`, 'Image attachment slot does not exist.')];
			const ownershipReference = slot && slot.id === attachment.slotId ? [] : [
				diagnostic('invalid-attachment', `attachments[${index}].slotId`, 'Image attachment slot reference is invalid.')
			];

			return [...assetReference, ...slotReference, ...ownershipReference];
		}

		const boneReference = boneIds.has(attachment.boneId)
			? []
			: [diagnostic('missing-reference', `attachments[${index}].boneId`, 'Gameplay attachment bone does not exist.')];
		return boneReference;
	});
	const setupDrawOrderIsValid = project.setupDrawOrder.length === project.slots.length
		&& !hasDuplicateValues(project.setupDrawOrder)
		&& project.setupDrawOrder.every((slotId) => slotIds.has(slotId));
	const setupDrawOrderDiagnostics = setupDrawOrderIsValid
		? []
		: [diagnostic('invalid-setup-draw-order', 'setupDrawOrder', 'Setup draw order must contain every slot exactly once.')];
	const boneOrderIsValid = project.boneOrder.length === project.bones.length
		&& !hasDuplicateValues(project.boneOrder)
		&& project.boneOrder.every((boneId) => boneIds.has(boneId));
	const boneOrderDiagnostics = boneOrderIsValid
		? []
		: [diagnostic('invalid-bone-order', 'boneOrder', 'Bone order must contain every bone exactly once.')];
	const unusedAttachmentIds = attachmentIds.size < project.attachments.length
		? [diagnostic('duplicate-id', 'attachments', 'Attachment IDs must be unique.')]
		: [];

	return [
		...slotDiagnostics,
		...attachmentDiagnostics,
		...setupDrawOrderDiagnostics,
		...boneOrderDiagnostics,
		...unusedAttachmentIds
	];
};

const isValidSlotOrder = function isValidSlotOrder(
	project: Project,
	value: readonly EntityId[]
): boolean {
	const slotIds = project.slots.map((slot) => slot.id);

	return value.length === slotIds.length
		&& !hasDuplicateValues(value)
		&& value.every((slotId) => slotIds.includes(slotId));
};

const isNumberTrack = function isNumberTrack(
	track: Track
): track is Extract<Track, { keys: readonly NumberKey[] }> {
	return track.kind === 'bone-transform'
		|| track.kind === 'attachment-transform'
		|| track.kind === 'attachment-opacity'
		|| track.kind === 'rectangle-size';
};

const validateNumberKey = function validateNumberKey(
	key: NumberKey,
	clip: Clip,
	path: string
): readonly ValidationDiagnostic[] {
	const timeIsValid = Number.isFinite(key.timeSeconds)
		&& key.timeSeconds >= 0
		&& key.timeSeconds <= clip.durationSeconds;
	const valueIsValid = Number.isFinite(key.value);
	const curveIsValid = key.interpolation !== 'bezier'
		? key.curve === null
		: key.curve !== null
			&& [key.curve.x1, key.curve.y1, key.curve.x2, key.curve.y2].every(Number.isFinite)
			&& key.curve.x1 >= 0
			&& key.curve.x1 <= 1
			&& key.curve.x2 >= 0
			&& key.curve.x2 <= 1;

	return timeIsValid && valueIsValid && curveIsValid
		? []
		: [diagnostic('invalid-key', path, 'Numeric keys need finite values, valid times, and valid curve metadata.')];
};

const validateTrackKeys = function validateTrackKeys(
	clip: Clip,
	track: Track,
	clipIndex: number,
	trackIndex: number
): readonly ValidationDiagnostic[] {
	const path = `clips[${clipIndex}].tracks[${trackIndex}]`;
	const timesAreStrictlyIncreasing = track.keys.every((key, index) => {
		const previous = track.keys[index - 1];
		return !previous || previous.timeSeconds < key.timeSeconds;
	});
	const orderDiagnostic = timesAreStrictlyIncreasing
		? []
		: [diagnostic('invalid-key', `${path}.keys`, 'Track keys must be strictly ordered by time.')];
	if (isNumberTrack(track)) {
		return [
			...orderDiagnostic,
			...track.keys.flatMap((key, index) => validateNumberKey(key, clip, `${path}.keys[${index}]`))
		];
	}

	const discreteKeyDiagnostics = track.keys.flatMap((key, index) => Number.isFinite(key.timeSeconds)
		&& key.timeSeconds >= 0
		&& key.timeSeconds <= clip.durationSeconds
		? []
		: [diagnostic('invalid-key', `${path}.keys[${index}]`, 'Discrete keys need finite times inside the clip duration.')]);

	return [
		...orderDiagnostic,
		...discreteKeyDiagnostics
	];
};

const validateTrackTarget = function validateTrackTarget(
	project: Project,
	track: Track,
	path: string
): readonly ValidationDiagnostic[] {
	if (track.kind === 'slot-draw-order') {
		return [];
	}
	if (track.kind === 'bone-transform') {
		return findBone(project, track.targetId)
			? []
			: [diagnostic('invalid-track-target', `${path}.targetId`, 'Bone transform track target does not exist.')];
	}
	if (track.kind === 'attachment-transform') {
		return findAttachment(project, track.targetId)
			? []
			: [diagnostic('invalid-track-target', `${path}.targetId`, 'Attachment transform track target does not exist.')];
	}
	if (track.kind === 'attachment-opacity') {
		const attachment = findAttachment(project, track.targetId);
		return attachment?.kind === 'image'
			? []
			: [diagnostic('invalid-track-target', `${path}.targetId`, 'Opacity tracks must target image attachments.')];
	}
	if (track.kind === 'slot-attachment') {
		return findSlot(project, track.targetId)
			? []
			: [diagnostic('invalid-track-target', `${path}.targetId`, 'Attachment tracks must target slots.')];
	}
	if (track.kind === 'point-enabled') {
		const attachment = findAttachment(project, track.targetId);
		return attachment?.kind === 'point'
			? []
			: [diagnostic('invalid-track-target', `${path}.targetId`, 'Point enabled tracks must target point attachments.')];
	}

	const attachment = findAttachment(project, track.targetId);
	return attachment?.kind === 'rectangle'
		? []
		: [diagnostic('invalid-track-target', `${path}.targetId`, 'Rectangle tracks must target rectangle attachments.')];
};

const validateDiscreteTrackValues = function validateDiscreteTrackValues(
	project: Project,
	track: Track,
	path: string
): readonly ValidationDiagnostic[] {
	if (track.kind === 'slot-attachment') {
		return track.keys.flatMap((key, index) => {
			const slot = findSlot(project, track.targetId);
			const attachment = key.value === null ? undefined : findAttachment(project, key.value);
			const valueIsValid = key.value === null || (
				attachment?.kind === 'image' && slot?.id === attachment.slotId
			);

			return valueIsValid
				? []
				: [diagnostic('invalid-key', `${path}.keys[${index}].value`, 'Attachment keys must reference an image in the tracked slot.')];
		});
	}
	if (track.kind === 'slot-draw-order') {
		return track.keys.flatMap((key, index) => isValidSlotOrder(project, key.value)
			? []
			: [diagnostic('invalid-key', `${path}.keys[${index}].value`, 'Draw-order keys must contain every slot exactly once.')]);
	}

	return [];
};

const validateClips = function validateClips(
	project: Project
): readonly ValidationDiagnostic[] {
	return project.clips.flatMap((clip, clipIndex) => {
		const settingsAreValid = Number.isFinite(clip.durationSeconds)
			&& clip.durationSeconds > 0
			&& Number.isFinite(clip.fps)
			&& clip.fps > 0;
		const settingsDiagnostics = settingsAreValid
			? []
			: [diagnostic('invalid-clip-settings', `clips[${clipIndex}]`, 'Clip duration and FPS must be positive finite numbers.')];
		const signatures = clip.tracks.map((track) => {
			const target = 'targetId' in track ? track.targetId : 'project';
			const property = 'property' in track ? track.property : '';
			return `${track.kind}:${target}:${property}`;
		});
		const duplicateTracks = signatures.filter((signature, index) => signatures.indexOf(signature) !== index);
		const duplicateDiagnostics = duplicateTracks.map((signature) => diagnostic(
			'duplicate-track',
			`clips[${clipIndex}].tracks`,
			`Duplicate track definition: ${signature}`
		));
		const trackDiagnostics = clip.tracks.flatMap((track, trackIndex) => {
			const path = `clips[${clipIndex}].tracks[${trackIndex}]`;

			return [
				...validateTrackTarget(project, track, path),
				...validateTrackKeys(clip, track, clipIndex, trackIndex),
				...validateDiscreteTrackValues(project, track, path)
			];
		});

		return [...settingsDiagnostics, ...duplicateDiagnostics, ...trackDiagnostics];
	});
};

export const validateProject = function validateProject(
	project: Project
): readonly ValidationDiagnostic[] {
	return [
		...validateIds(project),
		...validateBasicFields(project),
		...validateBoneHierarchy(project),
		...validateReferences(project),
		...validateClips(project)
	];
};

export const isValidProject = function isValidProject(project: Project): boolean {
	return validateProject(project).length === 0;
};

export const isRectangleAttachment = function isRectangleAttachment(
	attachment: Attachment
): attachment is RectangleAttachment {
	return attachment.kind === 'rectangle';
};
