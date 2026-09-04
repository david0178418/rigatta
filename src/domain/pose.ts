import {
	localTransformToMatrix,
	multiplyAffine,
	transformPoint,
	type AffineMatrix,
	type LocalTransform,
	type Point
} from './coordinates.ts';
import {
	sampleDiscreteKeys,
	sampleNumberKeys
} from './interpolation.ts';
import type {
	Attachment,
	BoneTransformTrack,
	BoneTransformProperty,
	Clip,
	ImageAttachment,
	PointAttachment,
	Project,
	RectangleAttachment,
	Slot,
	Track
} from './model.ts';
import { evaluateBoneWorldMatrices } from './transforms.ts';
import { validateProject, type ValidationDiagnostic } from './validation.ts';
import type { EntityId } from './ids.ts';

export type EvaluatedBone = Readonly<{
	id: EntityId;
	localTransform: LocalTransform;
	worldMatrix: AffineMatrix;
}>;

export type EvaluatedSlot = Readonly<{
	id: EntityId;
	boneId: EntityId;
	activeAttachmentId: EntityId | null;
}>;

export type EvaluatedImageAttachment = Readonly<{
	id: EntityId;
	kind: 'image';
	slotId: EntityId;
	assetId: EntityId;
	localTransform: LocalTransform;
	worldMatrix: AffineMatrix;
	opacity: number;
	active: boolean;
}>;

export type EvaluatedPointAttachment = Readonly<{
	id: EntityId;
	kind: 'point';
	boneId: EntityId;
	localTransform: LocalTransform;
	worldMatrix: AffineMatrix;
	position: Point;
	enabled: boolean;
}>;

export type EvaluatedRectangleAttachment = Readonly<{
	id: EntityId;
	kind: 'rectangle';
	boneId: EntityId;
	localTransform: LocalTransform;
	worldMatrix: AffineMatrix;
	width: number;
	height: number;
	rotation: number;
	corners: readonly [Point, Point, Point, Point];
	enabled: boolean;
}>;

export type EvaluatedAttachment =
	| EvaluatedImageAttachment
	| EvaluatedPointAttachment
	| EvaluatedRectangleAttachment;

export type EvaluatedPose = Readonly<{
	clipId: EntityId;
	timeSeconds: number;
	bones: readonly EvaluatedBone[];
	slots: readonly EvaluatedSlot[];
	attachments: readonly EvaluatedAttachment[];
	drawOrder: readonly EntityId[];
}>;

export type PoseValueOverride = Readonly<{
	targetId: EntityId;
	property: BoneTransformProperty | 'opacity' | 'width' | 'height';
	value: number;
}>;

export type EvaluatedGameplayPoint = Readonly<{
	id: EntityId;
	position: Point;
	enabled: boolean;
}>;

export type EvaluatedGameplayRectangle = Readonly<{
	id: EntityId;
	corners: readonly [Point, Point, Point, Point];
	width: number;
	height: number;
	rotation: number;
	enabled: boolean;
}>;

export type EvaluatedGameplayFrame = Readonly<{
	clipId: EntityId;
	timeSeconds: number;
	points: readonly EvaluatedGameplayPoint[];
	rectangles: readonly EvaluatedGameplayRectangle[];
}>;

export type PoseDiagnostic = Readonly<{
	code: 'missing-clip' | 'invalid-time';
	path: string;
	message: string;
}>;

export type PoseEvaluationResult = Readonly<{
	pose: EvaluatedPose | undefined;
	diagnostics: readonly (ValidationDiagnostic | PoseDiagnostic)[];
}>;

export type GameplayFrameEvaluationResult = Readonly<{
	frame: EvaluatedGameplayFrame | undefined;
	diagnostics: PoseEvaluationResult['diagnostics'];
}>;

const transformProperties = [
	'x',
	'y',
	'rotation',
	'scaleX',
	'scaleY',
	'shearX',
	'shearY'
] as const;

const setTransformProperty = function setTransformProperty(
	transform: LocalTransform,
	property: typeof transformProperties[number],
	value: number
): LocalTransform {
	const setters: Readonly<Record<typeof transformProperties[number], (current: LocalTransform, next: number) => LocalTransform>> = {
		x: (current, next) => ({ ...current, x: next }),
		y: (current, next) => ({ ...current, y: next }),
		rotation: (current, next) => ({ ...current, rotation: next }),
		scaleX: (current, next) => ({ ...current, scaleX: next }),
		scaleY: (current, next) => ({ ...current, scaleY: next }),
		shearX: (current, next) => ({ ...current, shearX: next }),
		shearY: (current, next) => ({ ...current, shearY: next })
	};

	return setters[property](transform, value);
};

const findClip = function findClip(project: Project, clipId: EntityId): Clip | undefined {
	return project.clips.find((clip) => clip.id === clipId);
};

const findBoneTrack = function findBoneTrack(
	clip: Clip,
	boneId: EntityId,
	property: typeof transformProperties[number]
): BoneTransformTrack | undefined {
	return clip.tracks.find((track): track is BoneTransformTrack => (
		track.kind === 'bone-transform'
		&& track.targetId === boneId
		&& track.property === property
	));
};

const findAttachmentTrack = function findAttachmentTrack(
	clip: Clip,
	attachmentId: EntityId,
	property: typeof transformProperties[number]
): Track | undefined {
	return clip.tracks.find((track) => (
		track.kind === 'attachment-transform'
		&& track.targetId === attachmentId
		&& track.property === property
	));
};

const effectiveTransform = function effectiveTransform(
	transform: LocalTransform,
	clip: Clip,
	targetId: EntityId,
	boneTarget: boolean,
	timeSeconds: number,
	overrides: readonly PoseValueOverride[]
): LocalTransform {
	return transformProperties.reduce((currentTransform, property) => {
		const track = boneTarget
			? findBoneTrack(clip, targetId, property)
			: findAttachmentTrack(clip, targetId, property);
		const sampledValue = track && (track.kind === 'bone-transform' || track.kind === 'attachment-transform')
			? sampleNumberKeys(
				track.keys,
				timeSeconds,
				currentTransform[property],
				property === 'rotation'
			)
			: currentTransform[property];
		const override = overrides.find((candidate) => candidate.targetId === targetId && candidate.property === property);

		return setTransformProperty(currentTransform, property, override?.value ?? sampledValue);
	}, transform);
};

const effectiveBoneTransforms = function effectiveBoneTransforms(
	project: Project,
	clip: Clip,
	timeSeconds: number,
	overrides: readonly PoseValueOverride[]
): ReadonlyMap<EntityId, LocalTransform> {
	return new Map(project.bones.map((bone) => [
		bone.id,
		effectiveTransform(bone.transform, clip, bone.id, true, timeSeconds, overrides)
	] as const));
};

const effectiveImageOpacity = function effectiveImageOpacity(
	attachment: ImageAttachment,
	clip: Clip,
	timeSeconds: number,
	overrides: readonly PoseValueOverride[]
): number {
	const track = clip.tracks.find((candidate) => (
		candidate.kind === 'attachment-opacity' && candidate.targetId === attachment.id
	));

	const sampledValue = track?.kind === 'attachment-opacity'
		? sampleNumberKeys(track.keys, timeSeconds, attachment.opacity)
		: attachment.opacity;
	const override = overrides.find((candidate) => candidate.targetId === attachment.id && candidate.property === 'opacity');

	return override?.value ?? sampledValue;
};

const effectiveSlotAttachment = function effectiveSlotAttachment(
	slot: Slot,
	clip: Clip,
	timeSeconds: number
): EntityId | null {
	const track = clip.tracks.find((candidate) => (
		candidate.kind === 'slot-attachment' && candidate.targetId === slot.id
	));

	return track?.kind === 'slot-attachment'
		? sampleDiscreteKeys(track.keys, timeSeconds, slot.setupAttachmentId)
		: slot.setupAttachmentId;
};

const effectivePointEnabled = function effectivePointEnabled(
	attachment: PointAttachment,
	clip: Clip,
	timeSeconds: number
): boolean {
	const track = clip.tracks.find((candidate) => (
		candidate.kind === 'point-enabled' && candidate.targetId === attachment.id
	));

	return track?.kind === 'point-enabled'
		? sampleDiscreteKeys(track.keys, timeSeconds, attachment.enabled)
		: attachment.enabled;
};

const effectiveRectangleSize = function effectiveRectangleSize(
	attachment: RectangleAttachment,
	clip: Clip,
	property: 'width' | 'height',
	timeSeconds: number,
	overrides: readonly PoseValueOverride[]
): number {
	const track = clip.tracks.find((candidate) => (
		candidate.kind === 'rectangle-size'
		&& candidate.targetId === attachment.id
		&& candidate.property === property
	));

	const sampledValue = track?.kind === 'rectangle-size'
		? sampleNumberKeys(track.keys, timeSeconds, attachment[property])
		: attachment[property];
	const override = overrides.find((candidate) => candidate.targetId === attachment.id && candidate.property === property);

	return override?.value ?? sampledValue;
};

const effectiveRectangleEnabled = function effectiveRectangleEnabled(
	attachment: RectangleAttachment,
	clip: Clip,
	timeSeconds: number
): boolean {
	const track = clip.tracks.find((candidate) => (
		candidate.kind === 'rectangle-enabled' && candidate.targetId === attachment.id
	));

	return track?.kind === 'rectangle-enabled'
		? sampleDiscreteKeys(track.keys, timeSeconds, attachment.enabled)
		: attachment.enabled;
};

const effectiveDrawOrder = function effectiveDrawOrder(
	project: Project,
	clip: Clip,
	timeSeconds: number
): readonly EntityId[] {
	const track = clip.tracks.find((candidate) => candidate.kind === 'slot-draw-order');

	return track?.kind === 'slot-draw-order'
		? [...sampleDiscreteKeys(track.keys, timeSeconds, project.setupDrawOrder)]
		: project.setupDrawOrder;
};

const normalizedTime = function normalizedTime(clip: Clip, timeSeconds: number): number {
	if (!clip.loop) {
		return Math.max(0, Math.min(clip.durationSeconds, timeSeconds));
	}

	const wrapped = timeSeconds % clip.durationSeconds;

	return wrapped < 0 ? wrapped + clip.durationSeconds : wrapped;
};

const imagePose = function imagePose(
	project: Project,
	attachment: ImageAttachment,
	clip: Clip,
	timeSeconds: number,
	activeAttachmentIds: ReadonlyMap<EntityId, EntityId | null>,
	worldMatrices: ReadonlyMap<EntityId, AffineMatrix>,
	overrides: readonly PoseValueOverride[]
): EvaluatedImageAttachment | undefined {
	const slot = project.slots.find((candidate) => candidate.id === attachment.slotId);
	const boneWorldMatrix = slot ? worldMatrices.get(slot.boneId) : undefined;

	if (!slot || !boneWorldMatrix) {
		return undefined;
	}

	const localTransform = effectiveTransform(attachment.transform, clip, attachment.id, false, timeSeconds, overrides);

	return {
		id: attachment.id,
		kind: 'image',
		slotId: attachment.slotId,
		assetId: attachment.assetId,
		localTransform,
		worldMatrix: multiplyAffine(boneWorldMatrix, localTransformToMatrix(localTransform)),
		opacity: effectiveImageOpacity(attachment, clip, timeSeconds, overrides),
		active: activeAttachmentIds.get(attachment.slotId) === attachment.id
	};
};

const pointPose = function pointPose(
	attachment: PointAttachment,
	project: Project,
	clip: Clip,
	timeSeconds: number,
	worldMatrices: ReadonlyMap<EntityId, AffineMatrix>,
	overrides: readonly PoseValueOverride[]
): EvaluatedPointAttachment | undefined {
	const boneWorldMatrix = worldMatrices.get(attachment.boneId);

	if (!boneWorldMatrix || !project.bones.some((bone) => bone.id === attachment.boneId)) {
		return undefined;
	}

	const localTransform = effectiveTransform(attachment.transform, clip, attachment.id, false, timeSeconds, overrides);
	const worldMatrix = multiplyAffine(boneWorldMatrix, localTransformToMatrix(localTransform));

	return {
		id: attachment.id,
		kind: 'point',
		boneId: attachment.boneId,
		localTransform,
		worldMatrix,
		position: transformPoint(worldMatrix, { x: 0, y: 0 }),
		enabled: effectivePointEnabled(attachment, clip, timeSeconds)
	};
};

const rectanglePose = function rectanglePose(
	attachment: RectangleAttachment,
	project: Project,
	clip: Clip,
	timeSeconds: number,
	worldMatrices: ReadonlyMap<EntityId, AffineMatrix>,
	overrides: readonly PoseValueOverride[]
): EvaluatedRectangleAttachment | undefined {
	const boneWorldMatrix = worldMatrices.get(attachment.boneId);

	if (!boneWorldMatrix || !project.bones.some((bone) => bone.id === attachment.boneId)) {
		return undefined;
	}

	const localTransform = effectiveTransform(attachment.transform, clip, attachment.id, false, timeSeconds, overrides);
	const worldMatrix = multiplyAffine(boneWorldMatrix, localTransformToMatrix(localTransform));
	const width = effectiveRectangleSize(attachment, clip, 'width', timeSeconds, overrides);
	const height = effectiveRectangleSize(attachment, clip, 'height', timeSeconds, overrides);

	return {
		id: attachment.id,
		kind: 'rectangle',
		boneId: attachment.boneId,
		localTransform,
		worldMatrix,
		width,
		height,
		rotation: Math.atan2(worldMatrix.b, worldMatrix.a),
		corners: [
			transformPoint(worldMatrix, { x: -width / 2, y: -height / 2 }),
			transformPoint(worldMatrix, { x: width / 2, y: -height / 2 }),
			transformPoint(worldMatrix, { x: width / 2, y: height / 2 }),
			transformPoint(worldMatrix, { x: -width / 2, y: height / 2 })
		],
		enabled: effectiveRectangleEnabled(attachment, clip, timeSeconds)
	};
};

const attachmentPose = function attachmentPose(
	project: Project,
	attachment: Attachment,
	clip: Clip,
	timeSeconds: number,
	activeAttachmentIds: ReadonlyMap<EntityId, EntityId | null>,
	worldMatrices: ReadonlyMap<EntityId, AffineMatrix>,
	overrides: readonly PoseValueOverride[]
): EvaluatedAttachment | undefined {
	if (attachment.kind === 'image') {
		return imagePose(project, attachment, clip, timeSeconds, activeAttachmentIds, worldMatrices, overrides);
	}
	if (attachment.kind === 'point') {
		return pointPose(attachment, project, clip, timeSeconds, worldMatrices, overrides);
	}

	return rectanglePose(attachment, project, clip, timeSeconds, worldMatrices, overrides);
};

export const evaluatePose = function evaluatePose(
	project: Project,
	clipId: EntityId,
	timeSeconds: number,
	overrides: readonly PoseValueOverride[] = []
): PoseEvaluationResult {
	const projectDiagnostics = validateProject(project);
	const clip = findClip(project, clipId);
	const clipDiagnostics = clip
		? []
		: [{ code: 'missing-clip' as const, path: 'clipId', message: 'Animation clip does not exist.' }];
	const timeDiagnostics = Number.isFinite(timeSeconds)
		? []
		: [{ code: 'invalid-time' as const, path: 'timeSeconds', message: 'Pose time must be finite.' }];
	const diagnostics = [...projectDiagnostics, ...clipDiagnostics, ...timeDiagnostics];

	if (!clip || diagnostics.length > 0) {
		return { pose: undefined, diagnostics };
	}

	const currentTime = normalizedTime(clip, timeSeconds);
	const localTransforms = effectiveBoneTransforms(project, clip, currentTime, overrides);
	const worldEvaluation = evaluateBoneWorldMatrices(project, localTransforms);
	const activeAttachmentIds = new Map(project.slots.map((slot) => [
		slot.id,
		effectiveSlotAttachment(slot, clip, currentTime)
	] as const));
	const attachments = project.attachments.flatMap((attachment) => {
		const evaluated = attachmentPose(project, attachment, clip, currentTime, activeAttachmentIds, worldEvaluation.matrices, overrides);

		return evaluated ? [evaluated] : [];
	});

	return {
		pose: {
			clipId: clip.id,
			timeSeconds: currentTime,
			bones: project.bones.flatMap((bone) => {
				const worldMatrix = worldEvaluation.matrices.get(bone.id);

				return worldMatrix ? [{
					id: bone.id,
					localTransform: localTransforms.get(bone.id) ?? bone.transform,
					worldMatrix
				}] : [];
			}),
			slots: project.slots.map((slot) => ({
				id: slot.id,
				boneId: slot.boneId,
				activeAttachmentId: activeAttachmentIds.get(slot.id) ?? null
			})),
			attachments,
			drawOrder: effectiveDrawOrder(project, clip, currentTime)
		},
		diagnostics: worldEvaluation.diagnostics
	};
};

export const gameplayFrameFromPose = function gameplayFrameFromPose(
	pose: EvaluatedPose
): EvaluatedGameplayFrame {
	return {
		clipId: pose.clipId,
		timeSeconds: pose.timeSeconds,
		points: pose.attachments.flatMap((attachment) => attachment.kind === 'point'
			? [{ id: attachment.id, position: attachment.position, enabled: attachment.enabled }]
			: []),
		rectangles: pose.attachments.flatMap((attachment) => attachment.kind === 'rectangle'
			? [{
				id: attachment.id,
				corners: attachment.corners,
				width: attachment.width,
				height: attachment.height,
				rotation: attachment.rotation,
				enabled: attachment.enabled
			}]
			: [])
	};
};

export const evaluateGameplayFrame = function evaluateGameplayFrame(
	project: Project,
	clipId: EntityId,
	timeSeconds: number
): GameplayFrameEvaluationResult {
	const poseResult = evaluatePose(project, clipId, timeSeconds);

	return {
		frame: poseResult.pose ? gameplayFrameFromPose(poseResult.pose) : undefined,
		diagnostics: poseResult.diagnostics
	};
};
