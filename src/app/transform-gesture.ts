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
export type TransformModifiers = Readonly<{ shiftKey?: boolean }>;

type TransformEntity = Extract<SelectableEntity, { kind: 'bone' | 'attachment' }>;
type RectangleResizeAxis = 'width' | 'height';

type RectangleSize = Readonly<{
	width: number;
	height: number;
}>;

type TransformTarget = Readonly<{
	entity: TransformEntity;
	initialTransform: LocalTransform;
	parentMatrix: AffineMatrix;
	worldMatrix: AffineMatrix;
	center: Point;
	rectangleSize: RectangleSize | undefined;
}>;

export type TransformGesture = Readonly<{
	entities: readonly TransformTarget[];
	tool: TransformTool;
	startPoint: Point;
	center: Point;
	rectangleResizeAxis: RectangleResizeAxis | undefined;
	constrained: boolean;
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
	const attachment = entity.kind === 'attachment'
		? project.attachments.find((candidate) => candidate.id === entity.id)
		: undefined;
	const rectangleSize = attachment?.kind === 'rectangle'
		? { width: attachment.width, height: attachment.height }
		: undefined;

	return initialTransform && parentMatrix && worldMatrix
		? {
			entity,
			initialTransform,
			parentMatrix,
			worldMatrix,
			center: transformPoint(worldMatrix, { x: 0, y: 0 }),
			rectangleSize
		}
		: undefined;
};

const rectangleResizeAxisFor = function rectangleResizeAxisFor(
	target: TransformTarget,
	point: Point
): RectangleResizeAxis | undefined {
	const size = target.rectangleSize;

	if (!size) {
		return undefined;
	}

	const handles: readonly Readonly<{ axis: RectangleResizeAxis; point: Point }>[] = [
		{ axis: 'width', point: transformPoint(target.worldMatrix, { x: size.width / 2, y: 0 }) },
		{ axis: 'height', point: transformPoint(target.worldMatrix, { x: 0, y: size.height / 2 }) }
	];

	return handles.find((handle) => Math.hypot(point.x - handle.point.x, point.y - handle.point.y) <= 10)?.axis;
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
	const rawDelta = localDeltaFor(gesture, target, point);

	if (!rawDelta) {
		return undefined;
	}

	const delta = gesture.constrained
		? Math.abs(rawDelta.x) >= Math.abs(rawDelta.y)
			? { x: rawDelta.x, y: 0 }
			: { x: 0, y: rawDelta.y }
		: rawDelta;

	const rawAngleDelta = angleDeltaForGesture(gesture, point);
	const angleDelta = gesture.constrained
		? Math.round(rawAngleDelta / (Math.PI / 12)) * (Math.PI / 12)
		: rawAngleDelta;
	const scaleFactor = gesture.constrained
		? 1 + (Math.abs(rawDelta.x) >= Math.abs(rawDelta.y) ? rawDelta.x : rawDelta.y) / 100
		: undefined;
	const updates: Record<TransformTool, (transform: LocalTransform) => LocalTransform> = {
		translate: (transform) => ({ ...transform, x: transform.x + delta.x, y: transform.y + delta.y }),
		rotate: (transform) => ({ ...transform, rotation: transform.rotation + angleDelta }),
		scale: (transform) => ({
			...transform,
			scaleX: transform.scaleX * Math.max(0.01, scaleFactor ?? 1 + delta.x / 100),
			scaleY: transform.scaleY * Math.max(0.01, scaleFactor ?? 1 + delta.y / 100)
		}),
		shear: (transform) => ({
			...transform,
			shearX: transform.shearX + (gesture.constrained ? delta.x / 100 : rawDelta.x / 100),
			shearY: transform.shearY + (gesture.constrained ? delta.y / 100 : rawDelta.y / 100)
		})
	};

	return updates[gesture.tool](target.initialTransform);
};

const rectangleSizeForTarget = function rectangleSizeForTarget(
	gesture: TransformGesture,
	target: TransformTarget,
	point: Point
): RectangleSize | undefined {
	const axis = gesture.rectangleResizeAxis;
	const initialSize = target.rectangleSize;

	if (!axis || !initialSize) {
		return undefined;
	}

	const startLocal = worldToLocalPoint(target.worldMatrix, gesture.startPoint);
	const currentLocal = worldToLocalPoint(target.worldMatrix, point);

	if (!startLocal || !currentLocal) {
		return undefined;
	}

	const width = Math.max(1, initialSize.width + (currentLocal.x - startLocal.x) * 2);
	const height = Math.max(1, initialSize.height + (currentLocal.y - startLocal.y) * 2);

	if (!gesture.constrained) {
		return axis === 'width'
			? { width, height: initialSize.height }
			: { width: initialSize.width, height };
	}

	const aspectRatio = initialSize.width / Math.max(1, initialSize.height);

	return axis === 'width'
		? { width, height: Math.max(1, width / aspectRatio) }
		: { width: Math.max(1, height * aspectRatio), height };
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
	tool: TransformTool,
	modifiers: TransformModifiers = {}
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
	const rectangleResizeAxis = tool === 'scale' && targets.length === 1 && targets[0]
		? rectangleResizeAxisFor(targets[0], startPoint)
		: undefined;

	return {
		entities: targets,
		tool,
		startPoint,
		center: centerForTargets(targets),
		rectangleResizeAxis,
		constrained: modifiers.shiftKey ?? false
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
		if (gesture.rectangleResizeAxis) {
			return true;
		}

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
	if (gesture.rectangleResizeAxis) {
		const rectangleCommands = gesture.entities.flatMap((target): readonly ProjectCommand[] => {
			const size = rectangleSizeForTarget(gesture, target, point);

			return size && target.entity.kind === 'attachment'
				? [{ kind: 'update-rectangle-size', attachmentId: target.entity.id, ...size }]
				: [];
		});

		return rectangleCommands.length === gesture.entities.length ? rectangleCommands : undefined;
	}

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
