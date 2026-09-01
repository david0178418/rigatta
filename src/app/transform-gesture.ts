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

type TransformTarget = Readonly<{
	entity: TransformEntity;
	initialTransform: LocalTransform;
	parentMatrix: AffineMatrix;
	center: Point;
}>;

export type TransformGesture = Readonly<{
	entities: readonly TransformTarget[];
	tool: TransformTool;
	startPoint: Point;
	center: Point;
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

const transformTargetForEntity = function transformTargetForEntity(
	project: Project,
	entity: TransformEntity,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>
): TransformTarget | undefined {
	const initialTransform = transformForEntity(project, entity);
	const parentMatrix = parentMatrixForEntity(project, entity, matrixByBone);
	const worldMatrix = worldMatrixForEntity(project, entity, matrixByBone);

	return initialTransform && parentMatrix && worldMatrix
		? {
			entity,
			initialTransform,
			parentMatrix,
			center: transformPoint(worldMatrix, { x: 0, y: 0 })
		}
		: undefined;
};

const centerForTargets = function centerForTargets(targets: readonly TransformTarget[]): Point {
	const total = targets.reduce(
		(sum, target) => ({ x: sum.x + target.center.x, y: sum.y + target.center.y }),
		{ x: 0, y: 0 }
	);

	return { x: total.x / targets.length, y: total.y / targets.length };
};

const shortestAngleDelta = function shortestAngleDelta(start: number, current: number): number {
	const fullTurn = Math.PI * 2;
	const delta = ((current - start + Math.PI) % fullTurn + fullTurn) % fullTurn;

	return delta - Math.PI;
};

const angleDeltaForGesture = function angleDeltaForGesture(
	gesture: TransformGesture,
	point: Point
): number {
	const startDistance = Math.hypot(
		gesture.startPoint.x - gesture.center.x,
		gesture.startPoint.y - gesture.center.y
	);

	return startDistance <= 1e-10
		? 0
		: shortestAngleDelta(
			Math.atan2(gesture.startPoint.y - gesture.center.y, gesture.startPoint.x - gesture.center.x),
			Math.atan2(point.y - gesture.center.y, point.x - gesture.center.x)
		);
};

const localDeltaFor = function localDeltaFor(
	gesture: TransformGesture,
	target: TransformTarget,
	point: Point
): Point | undefined {
	const startLocal = worldToLocalPoint(target.parentMatrix, gesture.startPoint);
	const currentLocal = worldToLocalPoint(target.parentMatrix, point);

	return startLocal && currentLocal
		? { x: currentLocal.x - startLocal.x, y: currentLocal.y - startLocal.y }
		: undefined;
};

const transformForTarget = function transformForTarget(
	gesture: TransformGesture,
	target: TransformTarget,
	point: Point
): LocalTransform | undefined {
	const delta = localDeltaFor(gesture, target, point);

	if (!delta) {
		return undefined;
	}

	const angleDelta = angleDeltaForGesture(gesture, point);
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

	return updates[gesture.tool](target.initialTransform);
};

const transformEntities = function transformEntities(
	entities: readonly SelectableEntity[]
): readonly TransformEntity[] {
	return entities.filter((entity): entity is TransformEntity => entity.kind === 'bone' || entity.kind === 'attachment');
};

export const createTransformGesture = function createTransformGesture(
	project: Project,
	entityOrEntities: SelectableEntity | readonly SelectableEntity[],
	startPoint: Point,
	tool: TransformTool
): TransformGesture | undefined {
	const entities = transformEntities(Array.isArray(entityOrEntities) ? entityOrEntities : [entityOrEntities]);
	const evaluation = evaluateBoneWorldMatrices(project);
	const targets = entities.flatMap((entity) => {
		const target = transformTargetForEntity(project, entity, evaluation.matrices);

		return target ? [target] : [];
	});

	if (targets.length === 0 || targets.some((target) => !worldToLocalPoint(target.parentMatrix, startPoint))) {
		return undefined;
	}

	return {
		entities: targets,
		tool,
		startPoint,
		center: centerForTargets(targets)
	};
};

export const isTransformHandleHit = function isTransformHandleHit(
	project: Project,
	entityOrEntities: SelectableEntity | readonly SelectableEntity[],
	point: Point,
	tool: TransformTool
): boolean {
	const gesture = createTransformGesture(project, entityOrEntities, point, tool);

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
		const horizontalDistance = Math.abs(point.y - gesture.center.y);
		const verticalDistance = Math.abs(point.x - gesture.center.x);

		return horizontalDistance <= 8 && Math.abs(point.x - gesture.center.x) <= 22
			|| verticalDistance <= 8 && Math.abs(point.y - gesture.center.y) <= 22;
	}

	return distance <= 10;
};

export const transformGestureCommands = function transformGestureCommands(
	gesture: TransformGesture,
	point: Point
): readonly ProjectCommand[] | undefined {
	const transforms = gesture.entities.map((target) => transformForTarget(gesture, target, point));

	if (transforms.some((transform) => !transform)) {
		return undefined;
	}

	return transforms.flatMap((transform, index): readonly ProjectCommand[] => {
		const target = gesture.entities[index];

		if (!transform || !target) {
			return [];
		}

		return target.entity.kind === 'bone'
			? [{ kind: 'update-bone-transform' as const, boneId: target.entity.id, transform }]
			: [{ kind: 'update-attachment-transform' as const, attachmentId: target.entity.id, transform }];
	});
};

export const transformGestureCommand = function transformGestureCommand(
	gesture: TransformGesture,
	point: Point
): ProjectCommand | undefined {
	return transformGestureCommands(gesture, point)?.[0];
};
