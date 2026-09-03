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
import type { BoneTransformProperty, Project } from '../domain/model.ts';
import type { EvaluatedPose } from '../domain/pose.ts';
import { evaluateBoneWorldMatrices } from '../domain/transforms.ts';
import type { ProjectCommand } from '../domain/commands.ts';
import type { SelectableEntity } from './selection.ts';

export type TransformTool = 'translate' | 'rotate' | 'scale' | 'shear';
export type TransformPhase = 'update' | 'end' | 'cancel';
export type TransformModifiers = Readonly<{ shiftKey?: boolean }>;
export type CanvasGestureMode = 'pan' | 'marquee' | 'transform';
export type RectangleResizeAxis = 'width' | 'height';
export type RectangleSize = Readonly<{
	width: number;
	height: number;
}>;

export const canvasGestureModeFor = function canvasGestureModeFor(
	pointerButton: number,
	spacePressed: boolean,
	transformClaimed: boolean
): CanvasGestureMode {
	return pointerButton === 1 || spacePressed
		? 'pan'
		: transformClaimed
			? 'transform'
			: 'marquee';
};

export type TransformGestureValues = Readonly<{
	delta: Point;
	angleDelta: number;
	scaleXFactor: number;
	scaleYFactor: number;
}>;

type TransformEntity = Extract<SelectableEntity, { kind: 'bone' | 'attachment' }>;

export type TransformGestureTarget = Readonly<{
	entity: TransformEntity;
	initialTransform: LocalTransform;
	parentMatrix: AffineMatrix;
	worldMatrix: AffineMatrix;
	center: Point;
	rectangleSize: RectangleSize | undefined;
}>;

export type TransformGesture = Readonly<{
	entities: readonly TransformGestureTarget[];
	tool: TransformTool;
	startPoint: Point;
	center: Point;
	rectangleResizeAxis: RectangleResizeAxis | undefined;
	constrained: boolean;
}>;

export type TransformGesturePropertyChange = Readonly<{
	kind: 'transform';
	entityKind: 'bone' | 'attachment';
	targetId: EntityId;
	property: BoneTransformProperty;
	initialValue: number;
	value: number;
	delta: number;
}>;

export type RectangleSizeGesturePropertyChange = Readonly<{
	kind: 'rectangle-size';
	targetId: EntityId;
	property: 'width' | 'height';
	initialValue: number;
	value: number;
	delta: number;
}>;

export type CanvasGesturePropertyChange = TransformGesturePropertyChange | RectangleSizeGesturePropertyChange;

export const transformGestureProperties = [
	'x',
	'y',
	'rotation',
	'scaleX',
	'scaleY',
	'shearX',
	'shearY'
] as const satisfies readonly BoneTransformProperty[];

const rectangleSizeProperties = ['width', 'height'] as const;

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
	entity: TransformEntity,
	pose: EvaluatedPose | undefined
): LocalTransform | undefined {
	if (pose) {
		return entity.kind === 'bone'
			? pose.bones.find((bone) => bone.id === entity.id)?.localTransform
			: pose.attachments.find((attachment) => attachment.id === entity.id)?.localTransform;
	}

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
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	pose: EvaluatedPose | undefined
): AffineMatrix | undefined {
	if (pose) {
		return entity.kind === 'bone'
			? pose.bones.find((bone) => bone.id === entity.id)?.worldMatrix
			: pose.attachments.find((attachment) => attachment.id === entity.id)?.worldMatrix;
	}

	const transform = transformForEntity(project, entity, pose);
	const parentMatrix = parentMatrixForEntity(project, entity, matrixByBone);

	return transform && parentMatrix
		? multiplyAffine(parentMatrix, localTransformToMatrix(transform))
		: undefined;
};

const transformTargetForEntity = function transformTargetForEntity(
	project: Project,
	entity: TransformEntity,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	pose: EvaluatedPose | undefined
): TransformGestureTarget | undefined {
	const initialTransform = transformForEntity(project, entity, pose);
	const parentMatrix = parentMatrixForEntity(project, entity, matrixByBone);
	const worldMatrix = worldMatrixForEntity(project, entity, matrixByBone, pose);
	const rectangleAttachment = entity.kind === 'attachment'
		? pose?.attachments.find((attachment) => attachment.id === entity.id)
			?? project.attachments.find((attachment) => attachment.id === entity.id)
		: undefined;
	const rectangleSize = rectangleAttachment?.kind === 'rectangle'
		? { width: rectangleAttachment.width, height: rectangleAttachment.height }
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
	target: TransformGestureTarget,
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

const centerForTargets = function centerForTargets(targets: readonly TransformGestureTarget[]): Point {
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

const dominantAxisDeltaFor = function dominantAxisDeltaFor(delta: Point): Point {
	return Math.abs(delta.x) >= Math.abs(delta.y)
		? { x: delta.x, y: 0 }
		: { x: 0, y: delta.y };
};

const snappedAngleDeltaFor = function snappedAngleDeltaFor(angleDelta: number): number {
	return Math.round(angleDelta / (Math.PI / 12)) * (Math.PI / 12);
};

export const transformGestureValuesFor = function transformGestureValuesFor(
	tool: TransformTool,
	rawDelta: Point,
	rawAngleDelta: number,
	constrained: boolean
): TransformGestureValues {
	const dominantDelta = dominantAxisDeltaFor(rawDelta);
	const constraintDelta = constrained && (tool === 'translate' || tool === 'shear')
		? dominantDelta
		: rawDelta;
	const scaleDelta = constrained ? (Math.abs(rawDelta.x) >= Math.abs(rawDelta.y) ? rawDelta.x : rawDelta.y) : undefined;
	const unconstrainedScaleX = tool === 'scale' ? Math.max(0.01, 1 + rawDelta.x / 100) : 1;
	const unconstrainedScaleY = tool === 'scale' ? Math.max(0.01, 1 + rawDelta.y / 100) : 1;
	const constrainedScale = tool === 'scale' && scaleDelta !== undefined
		? Math.max(0.01, 1 + scaleDelta / 100)
		: undefined;

	return {
		delta: constraintDelta,
		angleDelta: constrained && tool === 'rotate' ? snappedAngleDeltaFor(rawAngleDelta) : rawAngleDelta,
		scaleXFactor: constrained && tool === 'scale' ? constrainedScale ?? unconstrainedScaleX : unconstrainedScaleX,
		scaleYFactor: constrained && tool === 'scale' ? constrainedScale ?? unconstrainedScaleY : unconstrainedScaleY
	};
};

export const rectangleSizeForGesture = function rectangleSizeForGesture(
	initialSize: RectangleSize,
	axis: RectangleResizeAxis,
	proposedSize: RectangleSize,
	constrained: boolean
): RectangleSize {
	const width = Math.max(1, proposedSize.width);
	const height = Math.max(1, proposedSize.height);

	if (!constrained) {
		return axis === 'width'
			? { width, height: initialSize.height }
			: { width: initialSize.width, height };
	}

	const aspectRatio = initialSize.width / Math.max(1, initialSize.height);

	return axis === 'width'
		? { width, height: Math.max(1, width / aspectRatio) }
		: { width: Math.max(1, height * aspectRatio), height };
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
	target: TransformGestureTarget,
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
	target: TransformGestureTarget,
	point: Point
): LocalTransform | undefined {
	const rawDelta = localDeltaFor(gesture, target, point);

	if (!rawDelta) {
		return undefined;
	}

	const rawAngleDelta = angleDeltaForGesture(gesture, point);
	const values = transformGestureValuesFor(gesture.tool, rawDelta, rawAngleDelta, gesture.constrained);
	const updates: Record<TransformTool, (transform: LocalTransform) => LocalTransform> = {
		translate: (transform) => ({ ...transform, x: transform.x + values.delta.x, y: transform.y + values.delta.y }),
		rotate: (transform) => ({ ...transform, rotation: transform.rotation + values.angleDelta }),
		scale: (transform) => ({
			...transform,
			scaleX: Math.max(0.01, transform.scaleX * values.scaleXFactor),
			scaleY: Math.max(0.01, transform.scaleY * values.scaleYFactor)
		}),
		shear: (transform) => ({
			...transform,
			shearX: transform.shearX + values.delta.x / 100,
			shearY: transform.shearY + values.delta.y / 100
		})
	};

	return updates[gesture.tool](target.initialTransform);
};

const rectangleSizeForTarget = function rectangleSizeForTarget(
	gesture: TransformGesture,
	target: TransformGestureTarget,
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

	return rectangleSizeForGesture(initialSize, axis, {
		width: initialSize.width + (currentLocal.x - startLocal.x) * 2,
		height: initialSize.height + (currentLocal.y - startLocal.y) * 2
	}, gesture.constrained);
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
	modifiers: TransformModifiers = {},
	pose?: EvaluatedPose
): TransformGesture | undefined {
	const entities = transformEntities(Array.isArray(entityOrEntities) ? entityOrEntities : [entityOrEntities]);
	const evaluation = pose
		? { matrices: new Map(pose.bones.map((bone) => [bone.id, bone.worldMatrix] as const)) }
		: evaluateBoneWorldMatrices(project);
	const targets = entities.flatMap((entity) => {
		const target = transformTargetForEntity(project, entity, evaluation.matrices, pose);

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
	tool: TransformTool,
	pose?: EvaluatedPose
): boolean {
	const gesture = createTransformGesture(project, entityOrEntities, point, tool, {}, pose);

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

const transformChangeFor = function transformChangeFor(
	target: TransformGestureTarget,
	entityKind: 'bone' | 'attachment',
	targetId: EntityId,
	property: BoneTransformProperty,
	value: number
): TransformGesturePropertyChange | undefined {
	const initialValue = target.initialTransform[property];

	return Object.is(initialValue, value)
		? undefined
		: {
			kind: 'transform',
			entityKind,
			targetId,
			property,
			initialValue,
			value,
			delta: value - initialValue
		};
};

const rectangleChangeFor = function rectangleChangeFor(
	target: TransformGestureTarget,
	targetId: EntityId,
	property: 'width' | 'height',
	value: number
): RectangleSizeGesturePropertyChange | undefined {
	const initialValue = target.rectangleSize?.[property];

	return initialValue === undefined || Object.is(initialValue, value)
		? undefined
		: {
			kind: 'rectangle-size',
			targetId,
			property,
			initialValue,
			value,
			delta: value - initialValue
		};
};

export const transformGesturePropertyChangesFor = function transformGesturePropertyChangesFor(
	gesture: TransformGesture,
	commands: readonly ProjectCommand[]
): readonly CanvasGesturePropertyChange[] {
	return commands.flatMap((command): readonly CanvasGesturePropertyChange[] => {
		if (command.kind === 'update-bone-transform' || command.kind === 'update-attachment-transform') {
			const target = gesture.entities.find((candidate) => candidate.entity.id === (command.kind === 'update-bone-transform' ? command.boneId : command.attachmentId));

			return target
				? transformGestureProperties.flatMap((property) => {
					const change = transformChangeFor(target, command.kind === 'update-bone-transform' ? 'bone' : 'attachment', command.kind === 'update-bone-transform' ? command.boneId : command.attachmentId, property, command.transform[property]);

					return change ? [change] : [];
				})
				: [];
		}

		if (command.kind === 'update-rectangle-size') {
			const target = gesture.entities.find((candidate) => candidate.entity.kind === 'attachment' && candidate.entity.id === command.attachmentId);

			return target
				? rectangleSizeProperties.flatMap((property) => {
					const value = property === 'width' ? command.width : command.height;
					const change = rectangleChangeFor(target, command.attachmentId, property, value);

					return change ? [change] : [];
				})
				: [];
		}

		return [];
	});
};

export const transformGestureCommand = function transformGestureCommand(
	gesture: TransformGesture,
	point: Point
): ProjectCommand | undefined {
	return transformGestureCommands(gesture, point)?.[0];
};
