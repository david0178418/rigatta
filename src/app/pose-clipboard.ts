import type { LocalTransform } from '../domain/coordinates.ts';
import type { ProjectCommand } from '../domain/commands.ts';
import { createEntityId, isEntityId, type EntityId } from '../domain/ids.ts';
import type {
	AttachmentTransformTrack,
	BoneTransformTrack,
	Clip,
	NumberKey,
	Project
} from '../domain/model.ts';
import type { EvaluatedAttachment, EvaluatedPose } from '../domain/pose.ts';
import { validateProject } from '../domain/validation.ts';

export const poseTransformProperties = [
	'x',
	'y',
	'rotation',
	'scaleX',
	'scaleY',
	'shearX',
	'shearY'
] as const;

export type PoseTransformProperty = typeof poseTransformProperties[number];

export type PoseClipboardTransform = Readonly<{
	kind: 'bone' | 'attachment';
	targetId: EntityId;
	transform: LocalTransform;
}>;

export type PoseClipboard = Readonly<{
	projectId: EntityId;
	sourceClipId: EntityId;
	sourceFrameIndex: number;
	transforms: readonly PoseClipboardTransform[];
}>;

export type PoseClipboardErrorCode =
	| 'invalid-project'
	| 'invalid-clip'
	| 'invalid-frame'
	| 'invalid-pose'
	| 'invalid-clipboard'
	| 'project-mismatch'
	| 'incompatible-entity'
	| 'invalid-value'
	| 'invalid-id'
	| 'duplicate-id';

export type PoseClipboardError = Readonly<{
	code: PoseClipboardErrorCode;
	message: string;
	path?: string;
}>;

export type PoseClipboardResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: PoseClipboardError }>;

export type PosePasteSummary = Readonly<{
	bones: number;
	attachments: number;
	tracksCreated: number;
	keysCreated: number;
	keysUpdated: number;
	propertiesChanged: number;
}>;

export type PosePastePlan = Readonly<{
	commands: readonly ProjectCommand[];
	summary: PosePasteSummary;
	noOp: boolean;
}>;

export type PoseClipboardPastePlan = PosePastePlan;

type PoseEntityKind = PoseClipboardTransform['kind'];

type PoseEntity = Readonly<{
	kind: PoseEntityKind;
	targetId: EntityId;
}>;

type TransformTrack = BoneTransformTrack | AttachmentTransformTrack;

type PoseTransformSource = Readonly<{
	clipId: EntityId;
	timeSeconds: number;
	bones: readonly Readonly<{ id: EntityId; localTransform: LocalTransform }>[];
	attachments: readonly Readonly<{ id: EntityId; kind: EvaluatedAttachment['kind']; localTransform: LocalTransform }>[];
}>;

type PropertyPlan = Readonly<{
	entity: PoseEntity;
	property: PoseTransformProperty;
	value: number;
	track: TransformTrack | undefined;
	key: NumberKey | undefined;
}>;

type IdentifiedPropertyPlan = Readonly<{
	propertyPlan: PropertyPlan;
	trackId: EntityId;
	keyId: EntityId;
}>;

type AllocationState = Readonly<{
	plans: readonly IdentifiedPropertyPlan[];
	usedIds: readonly EntityId[];
}>;

const success = function success<TValue>(value: TValue): PoseClipboardResult<TValue> {
	return { ok: true, value };
};

const failure = function failure<TValue = never>(
	code: PoseClipboardErrorCode,
	message: string,
	path?: string
): PoseClipboardResult<TValue> {
	return { ok: false, error: { code, message, ...(path ? { path } : {}) } };
};

const isRecord = function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isFiniteNumber = function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
};

const hasOwn = function hasOwn(record: Readonly<Record<string, unknown>>, property: string): boolean {
	return Object.prototype.hasOwnProperty.call(record, property);
};

const copyLocalTransform = function copyLocalTransform(transform: LocalTransform): LocalTransform {
	return {
		x: transform.x,
		y: transform.y,
		rotation: transform.rotation,
		scaleX: transform.scaleX,
		scaleY: transform.scaleY,
		shearX: transform.shearX,
		shearY: transform.shearY
	};
};

const localTransformFromUnknown = function localTransformFromUnknown(value: unknown): LocalTransform | undefined {
	try {
		if (!isRecord(value)) {
			return undefined;
		}

		const keys = Reflect.ownKeys(value);
		const x = value.x;
		const y = value.y;
		const rotation = value.rotation;
		const scaleX = value.scaleX;
		const scaleY = value.scaleY;
		const shearX = value.shearX;
		const shearY = value.shearY;
		const keysAreValid = keys.length === poseTransformProperties.length
			&& keys.every((key) => typeof key === 'string' && poseTransformProperties.some((property) => property === key));

		if (!keysAreValid
			|| !hasOwn(value, 'x')
			|| !hasOwn(value, 'y')
			|| !hasOwn(value, 'rotation')
			|| !hasOwn(value, 'scaleX')
			|| !hasOwn(value, 'scaleY')
			|| !hasOwn(value, 'shearX')
			|| !hasOwn(value, 'shearY')
			|| !isFiniteNumber(x)
			|| !isFiniteNumber(y)
			|| !isFiniteNumber(rotation)
			|| !isFiniteNumber(scaleX)
			|| !isFiniteNumber(scaleY)
			|| !isFiniteNumber(shearX)
			|| !isFiniteNumber(shearY)) {
			return undefined;
		}

		return { x, y, rotation, scaleX, scaleY, shearX, shearY };
	} catch {
		return undefined;
	}
};

const isLocalTransformValue = function isLocalTransformValue(value: unknown): value is LocalTransform {
	return localTransformFromUnknown(value) !== undefined;
};

const poseClipboardTransformFromUnknown = function poseClipboardTransformFromUnknown(
	value: unknown
): PoseClipboardTransform | undefined {
	try {
		if (!isRecord(value)) {
			return undefined;
		}

		const kind = value.kind;
		const targetId = value.targetId;
		const transform = localTransformFromUnknown(value.transform);

		if ((kind !== 'bone' && kind !== 'attachment') || !isEntityId(targetId) || !transform) {
			return undefined;
		}

		return { kind, targetId, transform };
	} catch {
		return undefined;
	}
};

const parsePoseClipboard = function parsePoseClipboard(value: unknown): PoseClipboard | undefined {
	try {
		if (!isRecord(value)) {
			return undefined;
		}

		const projectId = value.projectId;
		const sourceClipId = value.sourceClipId;
		const sourceFrameIndex = value.sourceFrameIndex;
		const rawTransformsValue = value.transforms;
		const rawTransforms: readonly unknown[] = Array.isArray(rawTransformsValue) ? rawTransformsValue : [];

		if (!isEntityId(projectId)
			|| !isEntityId(sourceClipId)
			|| !isFiniteNumber(sourceFrameIndex)
			|| !Number.isInteger(sourceFrameIndex)
			|| sourceFrameIndex < 0
			|| rawTransforms.length === 0) {
			return undefined;
		}

		const parsedTransforms = rawTransforms.map((transform) => poseClipboardTransformFromUnknown(transform));
		const transforms = parsedTransforms.filter((transform): transform is PoseClipboardTransform => transform !== undefined);

		return transforms.length === rawTransforms.length
			&& new Set(transforms.map((transform) => transform.targetId)).size === transforms.length
			? {
				projectId,
				sourceClipId,
				sourceFrameIndex,
				transforms
			}
			: undefined;
	} catch {
		return undefined;
	}
};

export const isPoseClipboard = function isPoseClipboard(value: unknown): value is PoseClipboard {
	return parsePoseClipboard(value) !== undefined;
};

const isPoseTransformSource = function isPoseTransformSource(
	value: unknown
): value is PoseTransformSource {
	if (!isRecord(value)
		|| !isEntityId(value.clipId)
		|| !isFiniteNumber(value.timeSeconds)
		|| !Array.isArray(value.bones)
		|| !Array.isArray(value.attachments)) {
		return false;
	}

	const bonesAreValid = value.bones.every((bone): bone is Readonly<{ id: EntityId; localTransform: LocalTransform }> => (
		isRecord(bone)
		&& isEntityId(bone.id)
		&& isLocalTransformValue(bone.localTransform)
	));
	const attachmentsAreValid = value.attachments.every((attachment): attachment is Readonly<{ id: EntityId; kind: EvaluatedAttachment['kind']; localTransform: LocalTransform }> => (
		isRecord(attachment)
		&& isEntityId(attachment.id)
		&& (attachment.kind === 'image' || attachment.kind === 'point' || attachment.kind === 'rectangle')
		&& isLocalTransformValue(attachment.localTransform)
	));

	return bonesAreValid && attachmentsAreValid;
};

const frameCountForClip = function frameCountForClip(clip: Clip): number | undefined {
	if (!Number.isFinite(clip.durationSeconds) || clip.durationSeconds <= 0
		|| !Number.isFinite(clip.fps) || clip.fps <= 0) {
		return undefined;
	}

	const frameCount = Math.ceil(clip.durationSeconds * clip.fps);

	return Number.isFinite(frameCount) && frameCount > 0 ? frameCount : undefined;
};

const validFrameForClip = function validFrameForClip(clip: Clip, frameIndex: number): boolean {
	const frameCount = frameCountForClip(clip);

	return frameCount !== undefined
		&& Number.isInteger(frameIndex)
		&& frameIndex >= 0
		&& frameIndex < frameCount;
};

const projectWithClip = function projectWithClip(project: Project, clip: Clip): Project {
	return {
		...project,
		clips: project.clips.map((candidate) => candidate.id === clip.id ? clip : candidate)
	};
};

const projectValidationError = function projectValidationError(
	project: Project
): PoseClipboardError | undefined {
	try {
		const diagnostics = validateProject(project);
		const diagnostic = diagnostics[0];

		return diagnostic
			? {
				code: 'invalid-project',
				message: `The project is invalid: ${diagnostic.message}`,
				path: diagnostic.path
			}
			: undefined;
	} catch {
		return { code: 'invalid-project', message: 'The project model is malformed.' };
	}
};

const clipValidationError = function clipValidationError(
	project: Project,
	clip: Clip
): PoseClipboardError | undefined {
	if (!isEntityId(clip.id) || !project.clips.some((candidate) => candidate.id === clip.id)) {
		return { code: 'invalid-clip', message: 'The animation clip is not available in the project.' };
	}
	if (frameCountForClip(clip) === undefined) {
		return { code: 'invalid-clip', message: 'The animation clip has invalid timing.' };
	}

	return projectValidationError(projectWithClip(project, clip));
};

const clipInProject = function clipInProject(project: Project, clip: Clip): Clip | undefined {
	return project.clips.find((candidate) => candidate.id === clip.id);
};

const poseValidationError = function poseValidationError(
	project: Project,
	clip: Clip,
	frameIndex: number,
	pose: EvaluatedPose
): PoseClipboardError | undefined {
	if (!isPoseTransformSource(pose)) {
		return { code: 'invalid-pose', message: 'The evaluated pose is malformed or contains nonfinite transforms.' };
	}
	if (pose.clipId !== clip.id) {
		return { code: 'invalid-pose', message: 'The evaluated pose belongs to a different animation clip.' };
	}
	if (pose.timeSeconds < 0 || pose.timeSeconds > clip.durationSeconds
		|| Math.round(pose.timeSeconds * clip.fps) !== frameIndex) {
		return { code: 'invalid-pose', message: 'The evaluated pose does not match the requested source frame.' };
	}

	const boneIds = pose.bones.map((bone) => bone.id);
	const attachmentIds = pose.attachments.map((attachment) => attachment.id);
	const expectedBoneIds = project.bones.map((bone) => bone.id);
	const expectedAttachmentIds = project.attachments.map((attachment) => attachment.id);
	const bonesMatch = boneIds.length === expectedBoneIds.length
		&& new Set(boneIds).size === boneIds.length
		&& expectedBoneIds.every((id) => boneIds.includes(id));
	const attachmentsMatch = attachmentIds.length === expectedAttachmentIds.length
		&& new Set(attachmentIds).size === attachmentIds.length
		&& expectedAttachmentIds.every((id) => attachmentIds.includes(id));
	const attachmentKindsMatch = pose.attachments.every((attachment) => (
		project.attachments.some((candidate) => candidate.id === attachment.id && candidate.kind === attachment.kind)
	));

	return bonesMatch && attachmentsMatch && attachmentKindsMatch
		? undefined
		: { code: 'invalid-pose', message: 'The evaluated pose must contain every current bone and attachment exactly once.' };
};

const entitiesForProject = function entitiesForProject(project: Project): readonly PoseEntity[] {
	return [
		...project.bones.map((bone) => ({ kind: 'bone' as const, targetId: bone.id })),
		...project.attachments.map((attachment) => ({ kind: 'attachment' as const, targetId: attachment.id }))
	];
};

const clipboardCompatibilityError = function clipboardCompatibilityError(
	project: Project,
	clipboard: PoseClipboard
): PoseClipboardError | undefined {
	if (clipboard.projectId !== project.id) {
		return { code: 'project-mismatch', message: 'Pose clipboard belongs to a different project.' };
	}

	const expectedEntities = entitiesForProject(project);
	const entriesMatch = clipboard.transforms.length === expectedEntities.length
		&& expectedEntities.every((entity) => clipboard.transforms.some((transform) => (
			transform.kind === entity.kind && transform.targetId === entity.targetId
		)));

	return entriesMatch
		? undefined
		: { code: 'incompatible-entity', message: 'Pose clipboard entities are stale, missing, duplicated, or the wrong kind.' };
};

const transformTrackFor = function transformTrackFor(
	clip: Clip,
	entity: PoseEntity,
	property: PoseTransformProperty
): TransformTrack | undefined {
	return clip.tracks.find((track): track is TransformTrack => (
		entity.kind === 'bone'
			? track.kind === 'bone-transform' && track.targetId === entity.targetId && track.property === property
			: track.kind === 'attachment-transform' && track.targetId === entity.targetId && track.property === property
	));
};

const keyAtFrame = function keyAtFrame(
	clip: Clip,
	track: TransformTrack,
	frameIndex: number
): NumberKey | undefined {
	return track.keys.find((key) => Math.round(key.timeSeconds * clip.fps) === frameIndex);
};

const sourceTransformFor = function sourceTransformFor(
	clipboard: PoseClipboard,
	entity: PoseEntity
): LocalTransform | undefined {
	return clipboard.transforms.find((transform) => (
		transform.kind === entity.kind && transform.targetId === entity.targetId
	))?.transform;
};

const propertyPlansFor = function propertyPlansFor(
	project: Project,
	clip: Clip,
	frameIndex: number,
	clipboard: PoseClipboard
): readonly PropertyPlan[] {
	const entities = entitiesForProject(project);

	return entities.flatMap((entity) => {
		const transform = sourceTransformFor(clipboard, entity);

		return transform
			? poseTransformProperties.map((property) => {
				const track = transformTrackFor(clip, entity, property);
				return {
					entity,
					property,
					value: transform[property],
					track,
					key: track ? keyAtFrame(clip, track, frameIndex) : undefined
				};
			})
			: [];
	});
};

const projectEntityIds = function projectEntityIds(project: Project): readonly EntityId[] {
	return [
		project.id,
		...project.assets.map((asset) => asset.id),
		...project.bones.map((bone) => bone.id),
		...project.slots.map((slot) => slot.id),
		...project.attachments.map((attachment) => attachment.id),
		...project.clips.flatMap((clip) => [
			clip.id,
			...clip.tracks.map((track) => track.id),
			...clip.tracks.flatMap((track) => track.keys.map((key) => key.id)),
			...clip.events.map((event) => event.id)
		])
	];
};

const allocateId = function allocateId(
	idFactory: () => EntityId,
	usedIds: readonly EntityId[]
): PoseClipboardResult<EntityId> {
	try {
		const candidate: unknown = idFactory();

		if (!isEntityId(candidate)) {
			return failure('invalid-id', 'Pose paste ID allocation returned an invalid entity ID.');
		}
		if (usedIds.includes(candidate)) {
			return failure('duplicate-id', 'Pose paste ID allocation returned a colliding entity ID.');
		}

		return success(candidate);
	} catch {
		return failure('invalid-id', 'Pose paste ID allocation failed.');
	}
};

const identifyPropertyPlans = function identifyPropertyPlans(
	propertyPlans: readonly PropertyPlan[],
	idFactory: () => EntityId,
	initialUsedIds: readonly EntityId[]
): PoseClipboardResult<AllocationState> {
	return propertyPlans.reduce<PoseClipboardResult<AllocationState>>((result, propertyPlan) => {
		if (!result.ok) {
			return result;
		}

		const trackIdResult = propertyPlan.track
			? success(propertyPlan.track.id)
			: allocateId(idFactory, result.value.usedIds);

		if (!trackIdResult.ok) {
			return trackIdResult;
		}

		const usedAfterTrack = propertyPlan.track
			? result.value.usedIds
			: [...result.value.usedIds, trackIdResult.value];
		const keyIdResult = propertyPlan.key
			? success(propertyPlan.key.id)
			: allocateId(idFactory, usedAfterTrack);

		if (!keyIdResult.ok) {
			return keyIdResult;
		}

		const usedIds = propertyPlan.key
			? usedAfterTrack
			: [...usedAfterTrack, keyIdResult.value];
		const identifiedPlan: IdentifiedPropertyPlan = {
			propertyPlan,
			trackId: trackIdResult.value,
			keyId: propertyPlan.key ? propertyPlan.key.id : keyIdResult.value
		};

		return success({
			plans: [...result.value.plans, identifiedPlan],
			usedIds
		});
	}, {
		ok: true,
		value: { plans: [], usedIds: initialUsedIds }
	});
};

const commandsForPlan = function commandsForPlan(
	clip: Clip,
	frameIndex: number,
	identifiedPlan: IdentifiedPropertyPlan
): readonly ProjectCommand[] {
	const { propertyPlan, trackId, keyId } = identifiedPlan;
	const { entity, property, value, track, key } = propertyPlan;

	if (key && key.value === value) {
		return [];
	}

	const definition = entity.kind === 'bone'
		? { kind: 'bone-transform' as const, targetId: entity.targetId, property }
		: { kind: 'attachment-transform' as const, targetId: entity.targetId, property };
	const timeSeconds = key?.timeSeconds ?? frameIndex / clip.fps;
	const keyCommand: ProjectCommand = key
		? {
			kind: 'set-number-key',
			id: key.id,
			clipId: clip.id,
			trackId,
			input: {
				timeSeconds,
				value,
				interpolation: key.interpolation,
				curve: key.curve ? { ...key.curve } : null
			}
		}
		: {
			kind: 'add-number-key',
			id: keyId,
			clipId: clip.id,
			trackId,
			input: {
				timeSeconds,
				value,
				interpolation: 'linear',
				curve: null
			}
		};

	return [
		...(track ? [] : [{ kind: 'create-track' as const, id: trackId, clipId: clip.id, definition }]),
		keyCommand
	];
};

const summaryFor = function summaryFor(
	project: Project,
	identifiedPlans: readonly IdentifiedPropertyPlan[]
): PosePasteSummary {
	const changedPlans = identifiedPlans.filter((plan) => (
		!plan.propertyPlan.key || plan.propertyPlan.key.value !== plan.propertyPlan.value
	));

	return {
		bones: project.bones.length,
		attachments: project.attachments.length,
		tracksCreated: changedPlans.filter((plan) => !plan.propertyPlan.track).length,
		keysCreated: changedPlans.filter((plan) => !plan.propertyPlan.key).length,
		keysUpdated: changedPlans.filter((plan) => Boolean(plan.propertyPlan.key)).length,
		propertiesChanged: changedPlans.length
	};
};

export const createPoseClipboard = function createPoseClipboard(
	project: Project,
	clip: Clip,
	frameIndex: number,
	pose: EvaluatedPose
): PoseClipboardResult<PoseClipboard> {
	const projectError = projectValidationError(project);

	if (projectError) {
		return { ok: false, error: projectError };
	}
	const clipError = clipValidationError(project, clip);

	if (clipError) {
		return { ok: false, error: clipError };
	}
	const sourceClip = clipInProject(project, clip);

	if (!sourceClip) {
		return failure('invalid-clip', 'The animation clip is not available in the project.');
	}
	if (!validFrameForClip(sourceClip, frameIndex)) {
		return failure('invalid-frame', 'Pose copy requires an integer frame inside the clip bounds.');
	}
	const poseError = poseValidationError(project, sourceClip, frameIndex, pose);

	if (poseError) {
		return { ok: false, error: poseError };
	}

	const transforms: readonly PoseClipboardTransform[] = [
		...pose.bones.map((bone) => ({
			kind: 'bone' as const,
			targetId: bone.id,
			transform: copyLocalTransform(bone.localTransform)
		})),
		...pose.attachments.map((attachment) => ({
			kind: 'attachment' as const,
			targetId: attachment.id,
			transform: copyLocalTransform(attachment.localTransform)
		}))
	];

	if (transforms.length === 0) {
		return failure('invalid-pose', 'Pose copy requires at least one bone or attachment.');
	}

	return success({
		projectId: project.id,
		sourceClipId: sourceClip.id,
		sourceFrameIndex: frameIndex,
		transforms
	});
};

export const planPastePoseClipboard = function planPastePoseClipboard(
	project: Project,
	clip: Clip,
	frameIndex: number,
	clipboard: unknown,
	idFactory: () => EntityId = createEntityId
): PoseClipboardResult<PosePastePlan> {
	const projectError = projectValidationError(project);

	if (projectError) {
		return { ok: false, error: projectError };
	}
	const clipError = clipValidationError(project, clip);

	if (clipError) {
		return { ok: false, error: clipError };
	}
	const targetClip = clipInProject(project, clip);

	if (!targetClip) {
		return failure('invalid-clip', 'The animation clip is not available in the project.');
	}
	if (!validFrameForClip(targetClip, frameIndex)) {
		return failure('invalid-frame', 'Pose paste requires an integer frame inside the clip bounds.');
	}
	const parsedClipboard = parsePoseClipboard(clipboard);

	if (!parsedClipboard) {
		return failure('invalid-clipboard', 'The pose clipboard contains malformed or nonfinite data.');
	}
	const compatibilityError = clipboardCompatibilityError(project, parsedClipboard);

	if (compatibilityError) {
		return { ok: false, error: compatibilityError };
	}
	const sourceClip = project.clips.find((candidate) => candidate.id === parsedClipboard.sourceClipId);

	if (!sourceClip) {
		return failure('invalid-clip', 'The pose clipboard source clip is not available in the project.');
	}
	if (!validFrameForClip(sourceClip, parsedClipboard.sourceFrameIndex)) {
		return failure('invalid-frame', 'The pose clipboard source frame is outside its source clip bounds.');
	}
	const propertyPlans = propertyPlansFor(project, targetClip, frameIndex, parsedClipboard);
	const allocationResult = identifyPropertyPlans(
		propertyPlans,
		idFactory,
		projectEntityIds(project)
	);

	if (!allocationResult.ok) {
		return allocationResult;
	}

	const identifiedPlans = allocationResult.value.plans;
	const commands = identifiedPlans.flatMap((identifiedPlan) => commandsForPlan(targetClip, frameIndex, identifiedPlan));
	const summary = summaryFor(project, identifiedPlans);

	return success({ commands, summary, noOp: commands.length === 0 });
};
