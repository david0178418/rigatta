import { invertAffine, localTransformToMatrix, multiplyAffine, transformPoint, type AffineMatrix, type Point } from '../domain/coordinates.ts';
import type { EntityId } from '../domain/ids.ts';
import type { Attachment, ImageAttachment, Project } from '../domain/model.ts';
import type { EvaluatedPose } from '../domain/pose.ts';
import { evaluateBoneWorldMatrices } from '../domain/transforms.ts';
import type { SelectableEntity } from './selection.ts';
import type { LogicalBounds } from './viewport.ts';
import { isEditorEntityVisible } from './editor-visibility.ts';

const BONE_PREVIEW_LENGTH = 56;
const BONE_HIT_RADIUS = 9;
const GAMEPLAY_HIT_RADIUS = 10;

const worldMatrixForImage = function worldMatrixForImage(
	project: Project,
	attachment: ImageAttachment,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	pose: EvaluatedPose | undefined
): AffineMatrix | undefined {
	const evaluated = pose?.attachments.find((candidate) => candidate.id === attachment.id);

	if (evaluated?.kind === 'image') {
		return evaluated.worldMatrix;
	}
	if (pose) {
		return undefined;
	}

	const slot = project.slots.find((candidate) => candidate.id === attachment.slotId);
	const boneMatrix = slot ? matrixByBone.get(slot.boneId) : undefined;

	return boneMatrix ? multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform)) : undefined;
};

const pointInImage = function pointInImage(
	project: Project,
	attachment: ImageAttachment,
	point: Point,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	pose: EvaluatedPose | undefined
): boolean {
	const asset = project.assets.find((candidate) => candidate.id === attachment.assetId);
	const worldMatrix = worldMatrixForImage(project, attachment, matrixByBone, pose);
	const inverse = worldMatrix ? invertAffine(worldMatrix) : undefined;

	if (!asset || !inverse) {
		return false;
	}

	const localPoint = transformPoint(inverse, point);

	return localPoint.x >= -attachment.pivotX * asset.width
		&& localPoint.x <= (1 - attachment.pivotX) * asset.width
		&& localPoint.y >= -attachment.pivotY * asset.height
		&& localPoint.y <= (1 - attachment.pivotY) * asset.height;
};

const distanceToSegment = function distanceToSegment(
	point: Point,
	start: Point,
	end: Point
): number {
	const directionX = end.x - start.x;
	const directionY = end.y - start.y;
	const lengthSquared = directionX * directionX + directionY * directionY;
	const projection = lengthSquared === 0
		? 0
		: Math.min(1, Math.max(0, ((point.x - start.x) * directionX + (point.y - start.y) * directionY) / lengthSquared));
	const closest = {
		x: start.x + directionX * projection,
		y: start.y + directionY * projection
	};

	return Math.hypot(point.x - closest.x, point.y - closest.y);
};

const pointInAttachment = function pointInAttachment(
	project: Project,
	attachment: Attachment,
	point: Point,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	pose: EvaluatedPose | undefined
): boolean {
	if (attachment.kind === 'image') {
		return pointInImage(project, attachment, point, matrixByBone, pose);
	}

	const evaluated = pose?.attachments.find((candidate) => candidate.id === attachment.id);
	const worldMatrix = evaluated?.kind === attachment.kind
		? evaluated.worldMatrix
		: pose
			? undefined
			: matrixByBone.get(attachment.boneId);
	const attachmentMatrix = pose
		? worldMatrix
		: worldMatrix
			? multiplyAffine(worldMatrix, localTransformToMatrix(attachment.transform))
			: undefined;
	const inverse = attachmentMatrix ? invertAffine(attachmentMatrix) : undefined;

	if (!inverse) {
		return false;
	}

	const localPoint = transformPoint(inverse, point);

	return attachment.kind === 'point'
		? Math.hypot(localPoint.x, localPoint.y) <= GAMEPLAY_HIT_RADIUS
		: Math.abs(localPoint.x) <= (evaluated?.kind === 'rectangle' ? evaluated.width : attachment.width) / 2
			&& Math.abs(localPoint.y) <= (evaluated?.kind === 'rectangle' ? evaluated.height : attachment.height) / 2;
};

const worldMatrixForAttachment = function worldMatrixForAttachment(
	project: Project,
	attachment: Attachment,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	pose: EvaluatedPose | undefined
): AffineMatrix | undefined {
	const evaluated = pose?.attachments.find((candidate) => candidate.id === attachment.id);

	if (evaluated) {
		return evaluated.worldMatrix;
	}
	if (pose) {
		return undefined;
	}

	const boneId = attachment.kind === 'image'
		? project.slots.find((slot) => slot.id === attachment.slotId)?.boneId
		: attachment.boneId;
	const boneMatrix = boneId ? matrixByBone.get(boneId) : undefined;

	return boneMatrix ? multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform)) : undefined;
};

const localCornersForAttachment = function localCornersForAttachment(
	project: Project,
	attachment: Attachment,
	pose: EvaluatedPose | undefined
): readonly Point[] {
	if (attachment.kind === 'point') {
		return [{ x: 0, y: 0 }];
	}
	if (attachment.kind === 'rectangle') {
		const evaluated = pose?.attachments.find((candidate) => candidate.id === attachment.id);
		const width = evaluated?.kind === 'rectangle' ? evaluated.width : attachment.width;
		const height = evaluated?.kind === 'rectangle' ? evaluated.height : attachment.height;

		return [
			{ x: -width / 2, y: -height / 2 },
			{ x: width / 2, y: -height / 2 },
			{ x: -width / 2, y: height / 2 },
			{ x: width / 2, y: height / 2 }
		];
	}

	const asset = project.assets.find((candidate) => candidate.id === attachment.assetId);

	return asset ? [
		{ x: -attachment.pivotX * asset.width, y: -attachment.pivotY * asset.height },
		{ x: (1 - attachment.pivotX) * asset.width, y: -attachment.pivotY * asset.height },
		{ x: -attachment.pivotX * asset.width, y: (1 - attachment.pivotY) * asset.height },
		{ x: (1 - attachment.pivotX) * asset.width, y: (1 - attachment.pivotY) * asset.height }
	] : [];
};

const boundsForPoints = function boundsForPoints(points: readonly Point[]): LogicalBounds | undefined {
	if (points.length === 0) {
		return undefined;
	}

	const xValues = points.map((point) => point.x);
	const yValues = points.map((point) => point.y);
	const x = Math.min(...xValues);
	const y = Math.min(...yValues);

	return { x, y, w: Math.max(...xValues) - x, h: Math.max(...yValues) - y };
};

const intersects = function intersects(left: LogicalBounds, right: LogicalBounds): boolean {
	return left.x <= right.x + right.w
		&& left.x + left.w >= right.x
		&& left.y <= right.y + right.h
		&& left.y + left.h >= right.y;
};

const attachmentBounds = function attachmentBounds(
	project: Project,
	attachment: Attachment,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	pose: EvaluatedPose | undefined
): LogicalBounds | undefined {
	const matrix = worldMatrixForAttachment(project, attachment, matrixByBone, pose);

	return matrix
		? boundsForPoints(localCornersForAttachment(project, attachment, pose).map((point) => transformPoint(matrix, point)))
		: undefined;
};

const hitAttachment = function hitAttachment(
	project: Project,
	point: Point,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	hiddenIds: ReadonlySet<EntityId>,
	pose: EvaluatedPose | undefined
): SelectableEntity | undefined {
	const activeImageIds = pose
		? new Set(pose.slots.flatMap((slot) => slot.activeAttachmentId ? [slot.activeAttachmentId] : []))
		: new Set(project.slots.flatMap((slot) => slot.setupAttachmentId ? [slot.setupAttachmentId] : []));
	const attachments = [...project.attachments].reverse();

	const hit = attachments.find((attachment) => {
		if (!isEditorEntityVisible(project, attachment.id, hiddenIds)) {
			return false;
		}
		if (attachment.kind === 'image' && !activeImageIds.has(attachment.id)) {
			return false;
		}

		return pointInAttachment(project, attachment, point, matrixByBone, pose);
	});

	return hit ? { kind: 'attachment', id: hit.id } : undefined;
};

const hitBone = function hitBone(
	project: Project,
	point: Point,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	hiddenIds: ReadonlySet<EntityId>
): SelectableEntity | undefined {
	const hit = [...project.boneOrder].reverse().filter((boneId) => isEditorEntityVisible(project, boneId, hiddenIds)).map((boneId) => {
		const matrix = matrixByBone.get(boneId);

		if (!matrix) {
			return undefined;
		}

		return {
			boneId,
			start: transformPoint(matrix, { x: 0, y: 0 }),
			end: transformPoint(matrix, { x: BONE_PREVIEW_LENGTH, y: 0 })
		};
	}).find((candidate) => candidate !== undefined && distanceToSegment(point, candidate.start, candidate.end) <= BONE_HIT_RADIUS);

	return hit ? { kind: 'bone', id: hit.boneId } : undefined;
};

export const hitTestProject = function hitTestProject(
	project: Project,
	point: Point,
	hiddenIds: ReadonlySet<EntityId> = new Set<EntityId>(),
	pose?: EvaluatedPose
): SelectableEntity | undefined {
	const matrices = pose
		? new Map(pose.bones.map((bone) => [bone.id, bone.worldMatrix] as const))
		: evaluateBoneWorldMatrices(project).matrices;
	const attachment = hitAttachment(project, point, matrices, hiddenIds, pose);

	if (attachment) {
		return attachment;
	}

	return hitBone(project, point, matrices, hiddenIds);
};

export const entitiesInBounds = function entitiesInBounds(
	project: Project,
	bounds: LogicalBounds,
	hiddenIds: ReadonlySet<EntityId> = new Set<EntityId>(),
	pose?: EvaluatedPose
): readonly SelectableEntity[] {
	const matrices = pose
		? new Map(pose.bones.map((bone) => [bone.id, bone.worldMatrix] as const))
		: evaluateBoneWorldMatrices(project).matrices;
	const activeImageIds = pose
		? new Set(pose.slots.flatMap((slot) => slot.activeAttachmentId ? [slot.activeAttachmentId] : []))
		: new Set(project.slots.flatMap((slot) => slot.setupAttachmentId ? [slot.setupAttachmentId] : []));
	const attachmentEntities = project.attachments.flatMap((attachment) => {
		const isVisible = isEditorEntityVisible(project, attachment.id, hiddenIds)
			&& (attachment.kind === 'image' ? activeImageIds.has(attachment.id) : true);
		const attachmentBoundsValue = isVisible ? attachmentBounds(project, attachment, matrices, pose) : undefined;

		return attachmentBoundsValue && intersects(bounds, attachmentBoundsValue)
			? [{ kind: 'attachment' as const, id: attachment.id }]
			: [];
	});
const boneEntities = project.boneOrder.flatMap((boneId) => {
		if (!isEditorEntityVisible(project, boneId, hiddenIds)) {
			return [];
		}

		const matrix = matrices.get(boneId);

		if (!matrix) {
			return [];
		}

		const boneBounds = boundsForPoints([
			transformPoint(matrix, { x: 0, y: 0 }),
			transformPoint(matrix, { x: BONE_PREVIEW_LENGTH, y: 0 })
		]);

		return boneBounds && intersects(bounds, boneBounds)
			? [{ kind: 'bone' as const, id: boneId }]
			: [];
	});

	return [...attachmentEntities, ...boneEntities];
};
