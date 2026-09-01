import {
	identityMatrix,
	localTransformToMatrix,
	multiplyAffine,
	transformPoint,
	worldToLocalPoint,
	type AffineMatrix,
	type LocalTransform,
	type Point
} from '../domain/coordinates.ts';
import type { EntityId } from '../domain/ids.ts';
import type { Project } from '../domain/model.ts';
import { evaluateBoneWorldMatrices } from '../domain/transforms.ts';
import type { ProjectCommand } from '../domain/commands.ts';
import type { SelectableEntity } from './selection.ts';

export type TransformTool = 'translate' | 'rotate' | 'scale' | 'shear';
export type TransformPhase = 'update' | 'end' | 'cancel';

type TransformEntity = Extract<SelectableEntity, { kind: 'bone' | 'attachment' }>;

export type TransformGesture = Readonly<{
	entity: TransformEntity;
	tool: TransformTool;
	startPoint: Point;
	center: Point;
	initialTransform: LocalTransform;
	parentMatrix: AffineMatrix;
}>;

const attachmentBoneId = function attachmentBoneId(
	project: Project,
	attachmentId: EntityId
): EntityId | undefined {
	const attachment = project.attachments.find((candidate) => candidate.id === attachmentId);

	return attachment?.kind === 'image'
		? project.slots.find((slot) => slot.id === attachment.slotId)?.boneId
		: attachment?.boneId;
};

const transformForEntity = function transformForEntity(
	project: Project,
	entity: TransformEntity
): LocalTransform | undefined {
	return entity.kind === 'bone'
		? project.bones.find((bone) => bone.id === entity.id)?.transform
		: project.attachments.find((attachment) => attachment.id === entity.id)?.transform;
};

const parentMatrixForEntity = function parentMatrixForEntity(
	project: Project,
	entity: TransformEntity,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): AffineMatrix | undefined {
	if (entity.kind === 'bone') {
		const bone = project.bones.find((candidate) => candidate.id === entity.id);

		return bone?.parentId ? matrixByBone.get(bone.parentId) : identityMatrix();
	}

	const boneId = attachmentBoneId(project, entity.id);

	return boneId ? matrixByBone.get(boneId) : undefined;
};

const worldMatrixForEntity = function worldMatrixForEntity(
	project: Project,
	entity: TransformEntity,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): AffineMatrix | undefined {
	const transform = transformForEntity(project, entity);
	const parentMatrix = parentMatrixForEntity(project, entity, matrixByBone);

	return transform && parentMatrix
		? multiplyAffine(parentMatrix, localTransformToMatrix(transform))
		: undefined;
};

const shortestAngleDelta = function shortestAngleDelta(start: number, current: number): number {
	const fullTurn = Math.PI * 2;
	const delta = ((current - start + Math.PI) % fullTurn + fullTurn) % fullTurn;

	return delta - Math.PI;
};

const localDeltaFor = function localDeltaFor(
	gesture: TransformGesture,
	point: Point
): Point | undefined {
	const startLocal = worldToLocalPoint(gesture.parentMatrix, gesture.startPoint);
	const currentLocal = worldToLocalPoint(gesture.parentMatrix, point);

	return startLocal && currentLocal
		? { x: currentLocal.x - startLocal.x, y: currentLocal.y - startLocal.y }
		: undefined;
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

const transformForGesture = function transformForGesture(
	gesture: TransformGesture,
	point: Point
): LocalTransform | undefined {
	const delta = localDeltaFor(gesture, point);

	if (!delta) {
		return undefined;
	}

	const angleDelta = Math.hypot(
		gesture.startPoint.x - gesture.center.x,
		gesture.startPoint.y - gesture.center.y
	) <= 1e-10
		? 0
		: shortestAngleDelta(
			Math.atan2(gesture.startPoint.y - gesture.center.y, gesture.startPoint.x - gesture.center.x),
			Math.atan2(point.y - gesture.center.y, point.x - gesture.center.x)
		);
	const updates: Record<TransformTool, (transform: LocalTransform) => LocalTransform> = {
		translate: (transform) => ({ ...transform, x: transform.x + delta.x, y: transform.y + delta.y }),
		rotate: (transform) => ({ ...transform, rotation: transform.rotation + angleDelta }),
		scale: (transform) => ({
			...transform,
			scaleX: transform.scaleX * Math.max(0.01, 1 + delta.x / 100),
			scaleY: transform.scaleY * Math.max(0.01, 1 + delta.y / 100)
		}),
		shear: (transform) => ({
			...transform,
			shearX: transform.shearX + delta.x / 100,
			shearY: transform.shearY + delta.y / 100
		})
	};

	return updates[gesture.tool](gesture.initialTransform);
};

export const createTransformGesture = function createTransformGesture(
	project: Project,
	entity: SelectableEntity,
	startPoint: Point,
	tool: TransformTool
): TransformGesture | undefined {
	if (entity.kind !== 'bone' && entity.kind !== 'attachment') {
		return undefined;
	}

	const evaluation = evaluateBoneWorldMatrices(project);
	const initialTransform = transformForEntity(project, entity);
	const parentMatrix = parentMatrixForEntity(project, entity, evaluation.matrices);
	const worldMatrix = worldMatrixForEntity(project, entity, evaluation.matrices);

	if (!initialTransform || !parentMatrix || !worldMatrix || !worldToLocalPoint(parentMatrix, startPoint)) {
		return undefined;
	}

	return {
		entity,
		tool,
		startPoint,
		center: transformPoint(worldMatrix, { x: 0, y: 0 }),
		initialTransform,
		parentMatrix
	};
};

export const isTransformHandleHit = function isTransformHandleHit(
	project: Project,
	entity: SelectableEntity,
	point: Point,
	tool: TransformTool
): boolean {
	const gesture = createTransformGesture(project, entity, point, tool);

	if (!gesture) {
		return false;
	}

	const distance = Math.hypot(point.x - gesture.center.x, point.y - gesture.center.y);

	if (tool === 'rotate') {
		return Math.abs(distance - 30) <= 9;
	}
	if (tool === 'scale') {
		return Math.hypot(point.x - (gesture.center.x + 38), point.y - gesture.center.y) <= 10
			|| Math.hypot(point.x - gesture.center.x, point.y - (gesture.center.y + 38)) <= 10;
	}

	if (tool === 'shear') {
		return distanceToSegment(
			point,
			{ x: gesture.center.x - 22, y: gesture.center.y },
			{ x: gesture.center.x + 22, y: gesture.center.y }
		) <= 8
			|| distanceToSegment(
				point,
				{ x: gesture.center.x, y: gesture.center.y - 22 },
				{ x: gesture.center.x, y: gesture.center.y + 22 }
			) <= 8;
	}

	return distance <= 10;
};

export const transformGestureCommand = function transformGestureCommand(
	gesture: TransformGesture,
	point: Point
): ProjectCommand | undefined {
	const transform = transformForGesture(gesture, point);

	if (!transform) {
		return undefined;
	}

	return gesture.entity.kind === 'bone'
		? { kind: 'update-bone-transform', boneId: gesture.entity.id, transform }
		: { kind: 'update-attachment-transform', attachmentId: gesture.entity.id, transform };
};
