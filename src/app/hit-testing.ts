import { invertAffine, localTransformToMatrix, multiplyAffine, transformPoint, type AffineMatrix, type Point } from '../domain/coordinates.ts';
import type { EntityId } from '../domain/ids.ts';
import type { Attachment, ImageAttachment, Project } from '../domain/model.ts';
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
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): AffineMatrix | undefined {
	const slot = project.slots.find((candidate) => candidate.id === attachment.slotId);
	const boneMatrix = slot ? matrixByBone.get(slot.boneId) : undefined;

	return boneMatrix ? multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform)) : undefined;
};

const pointInImage = function pointInImage(
	project: Project,
	attachment: ImageAttachment,
	point: Point,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): boolean {
	const asset = project.assets.find((candidate) => candidate.id === attachment.assetId);
	const worldMatrix = worldMatrixForImage(project, attachment, matrixByBone);
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
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): boolean {
	if (attachment.kind === 'image') {
		return pointInImage(project, attachment, point, matrixByBone);
	}

	const worldMatrix = matrixByBone.get(attachment.boneId);
	const inverse = worldMatrix
		? invertAffine(multiplyAffine(worldMatrix, localTransformToMatrix(attachment.transform)))
		: undefined;

	if (!inverse) {
		return false;
	}

	const localPoint = transformPoint(inverse, point);

	return attachment.kind === 'point'
		? Math.hypot(localPoint.x, localPoint.y) <= GAMEPLAY_HIT_RADIUS
		: Math.abs(localPoint.x) <= attachment.width / 2 && Math.abs(localPoint.y) <= attachment.height / 2;
};

const worldMatrixForAttachment = function worldMatrixForAttachment(
	project: Project,
	attachment: Attachment,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): AffineMatrix | undefined {
	const boneId = attachment.kind === 'image'
		? project.slots.find((slot) => slot.id === attachment.slotId)?.boneId
		: attachment.boneId;
	const boneMatrix = boneId ? matrixByBone.get(boneId) : undefined;

	return boneMatrix ? multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform)) : undefined;
};

const localCornersForAttachment = function localCornersForAttachment(
	project: Project,
	attachment: Attachment
): readonly Point[] {
	if (attachment.kind === 'point') {
		return [{ x: 0, y: 0 }];
	}
	if (attachment.kind === 'rectangle') {
		return [
			{ x: -attachment.width / 2, y: -attachment.height / 2 },
			{ x: attachment.width / 2, y: -attachment.height / 2 },
			{ x: -attachment.width / 2, y: attachment.height / 2 },
			{ x: attachment.width / 2, y: attachment.height / 2 }
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
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): LogicalBounds | undefined {
	const matrix = worldMatrixForAttachment(project, attachment, matrixByBone);

	return matrix
		? boundsForPoints(localCornersForAttachment(project, attachment).map((point) => transformPoint(matrix, point)))
		: undefined;
};

const hitAttachment = function hitAttachment(
	project: Project,
	point: Point,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	hiddenIds: ReadonlySet<EntityId>
): SelectableEntity | undefined {
	const activeImageIds = new Set(project.slots.flatMap((slot) => slot.setupAttachmentId ? [slot.setupAttachmentId] : []));
	const attachments = [...project.attachments].reverse();

	const hit = attachments.find((attachment) => {
		if (!isEditorEntityVisible(project, attachment.id, hiddenIds)) {
			return false;
		}
		if (attachment.kind === 'image' && !activeImageIds.has(attachment.id)) {
			return false;
		}

		return pointInAttachment(project, attachment, point, matrixByBone);
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
	hiddenIds: ReadonlySet<EntityId> = new Set<EntityId>()
): SelectableEntity | undefined {
	const evaluation = evaluateBoneWorldMatrices(project);
	const attachment = hitAttachment(project, point, evaluation.matrices, hiddenIds);

	if (attachment) {
		return attachment;
	}

	return hitBone(project, point, evaluation.matrices, hiddenIds);
};

export const entitiesInBounds = function entitiesInBounds(
	project: Project,
	bounds: LogicalBounds,
	hiddenIds: ReadonlySet<EntityId> = new Set<EntityId>()
): readonly SelectableEntity[] {
	const evaluation = evaluateBoneWorldMatrices(project);
	const activeImageIds = new Set(project.slots.flatMap((slot) => slot.setupAttachmentId ? [slot.setupAttachmentId] : []));
	const attachmentEntities = project.attachments.flatMap((attachment) => {
		const isVisible = isEditorEntityVisible(project, attachment.id, hiddenIds)
			&& (attachment.kind === 'image' ? activeImageIds.has(attachment.id) : true);
		const attachmentBoundsValue = isVisible ? attachmentBounds(project, attachment, evaluation.matrices) : undefined;

		return attachmentBoundsValue && intersects(bounds, attachmentBoundsValue)
			? [{ kind: 'attachment' as const, id: attachment.id }]
			: [];
	});
const boneEntities = project.boneOrder.flatMap((boneId) => {
		if (!isEditorEntityVisible(project, boneId, hiddenIds)) {
			return [];
		}

		const matrix = evaluation.matrices.get(boneId);

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
