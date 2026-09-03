import { Container, Graphics, Matrix, Sprite } from 'pixi.js';
import { localTransformToMatrix, multiplyAffine, transformPoint, type AffineMatrix, type Point } from '../domain/coordinates.ts';
import type { Attachment, CanvasSize, ImageAttachment, Project } from '../domain/model.ts';
import type { EntityId } from '../domain/ids.ts';
import type { EvaluatedAttachment, EvaluatedImageAttachment, EvaluatedPose } from '../domain/pose.ts';
import { evaluateBoneWorldMatrices } from '../domain/transforms.ts';
import { validateProject } from '../domain/validation.ts';
import { isEditorEntityVisible } from '../app/editor-visibility.ts';
import { poseImageRenderInstances, setupImageRenderInstances, type ImageRenderInstance } from './pose-images.ts';
import type { PreparedImage } from './image-resources.ts';
import { rendererFailure, rendererSuccess, type FixedCanvasRenderOptions, type RendererResult } from './renderer-types.ts';

const DEFAULT_GRID_SPACING = 32;
const BONE_PREVIEW_LENGTH = 56;

type GameplayAttachment = Exclude<Attachment, ImageAttachment>;
type EvaluatedGameplayAttachment = Exclude<EvaluatedAttachment, EvaluatedImageAttachment>;

export type RenderBone = Readonly<{
	id: EntityId;
	start: Point;
	end: Point;
}>;

export type RenderGameplayAttachment =
	| Readonly<{
		id: EntityId;
		kind: 'point';
		worldMatrix: AffineMatrix;
		enabled: boolean;
	}>
	| Readonly<{
		id: EntityId;
		kind: 'rectangle';
		worldMatrix: AffineMatrix;
		width: number;
		height: number;
		enabled: boolean;
	}>;

export type RenderSelectionGuide =
	| Readonly<{
		kind: 'bone';
		start: Point;
		end: Point;
	}>
	| Readonly<{
		kind: 'image';
		worldMatrix: AffineMatrix;
		x: number;
		y: number;
		width: number;
		height: number;
	}>
	| Readonly<{
		kind: 'point';
		worldMatrix: AffineMatrix;
	}>
	| Readonly<{
		kind: 'rectangle';
		worldMatrix: AffineMatrix;
		width: number;
		height: number;
	}>;

export type RenderTransformHandles = Readonly<{
	tool: NonNullable<FixedCanvasRenderOptions['transformTool']>;
	center: Point;
	rectangleHandlePoints: Readonly<{
		right: Point;
		bottom: Point;
	}> | undefined;
}>;

export type RenderScene = Readonly<{
	canvas: CanvasSize;
	boneMatrices: ReadonlyMap<EntityId, AffineMatrix>;
	images: readonly ImageRenderInstance[];
	bones: readonly RenderBone[];
	gameplayAttachments: readonly RenderGameplayAttachment[];
	selectionGuides: readonly RenderSelectionGuide[];
	transformHandles: RenderTransformHandles | undefined;
	gridSpacing: number | undefined;
}>;

const isGameplayAttachment = function isGameplayAttachment(attachment: Attachment): attachment is GameplayAttachment {
	return attachment.kind !== 'image';
};

const isEvaluatedGameplayAttachment = function isEvaluatedGameplayAttachment(attachment: EvaluatedAttachment): attachment is EvaluatedGameplayAttachment {
	return attachment.kind !== 'image';
};

const validGridSpacing = function validGridSpacing(spacing: number | undefined): spacing is number {
	return spacing !== undefined && Number.isFinite(spacing) && spacing > 0;
};

const projectError = function projectError(project: Project): RendererResult<void> {
	const diagnostics = validateProject(project);

	return diagnostics.length > 0
		? rendererFailure('invalid-project', diagnostics[0]?.message ?? 'Project validation failed.')
		: rendererSuccess(undefined);
};

const pixiMatrix = function pixiMatrix(matrix: AffineMatrix): Matrix {
	return new Matrix(matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty);
};

const createBones = function createBones(
	project: Project,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	hiddenIds: ReadonlySet<EntityId>
): readonly RenderBone[] {
	return project.bones
		.filter((bone) => isEditorEntityVisible(project, bone.id, hiddenIds))
		.flatMap((bone) => {
			const matrix = matrixByBone.get(bone.id);

			return matrix
				? [{
					id: bone.id,
					start: transformPoint(matrix, { x: 0, y: 0 }),
					end: transformPoint(matrix, { x: BONE_PREVIEW_LENGTH, y: 0 })
				}]
				: [];
		});
};

const createSetupGameplayAttachments = function createSetupGameplayAttachments(
	project: Project,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	showGameplay: boolean,
	hiddenIds: ReadonlySet<EntityId>
): readonly RenderGameplayAttachment[] {
	if (!showGameplay) {
		return [];
	}

	return project.attachments
		.filter(isGameplayAttachment)
		.filter((attachment) => isEditorEntityVisible(project, attachment.id, hiddenIds))
		.flatMap((attachment): readonly RenderGameplayAttachment[] => {
			const boneMatrix = matrixByBone.get(attachment.boneId);

			if (!boneMatrix) {
				return [];
			}

			const renderAttachment = {
				id: attachment.id,
				worldMatrix: multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform)),
				enabled: attachment.enabled
			};

			return attachment.kind === 'point'
				? [{ ...renderAttachment, kind: 'point' as const }]
				: [{
					...renderAttachment,
					kind: 'rectangle' as const,
					width: attachment.width,
					height: attachment.height
				}];
		});
};

const createPoseGameplayAttachments = function createPoseGameplayAttachments(
	project: Project,
	pose: EvaluatedPose,
	showGameplay: boolean,
	hiddenIds: ReadonlySet<EntityId>
): readonly RenderGameplayAttachment[] {
	if (!showGameplay) {
		return [];
	}

	return pose.attachments
		.filter(isEvaluatedGameplayAttachment)
		.filter((attachment) => isEditorEntityVisible(project, attachment.id, hiddenIds))
		.map((attachment) => attachment.kind === 'point'
			? {
					id: attachment.id,
					kind: 'point' as const,
					worldMatrix: attachment.worldMatrix,
					enabled: attachment.enabled
				}
			: {
					id: attachment.id,
					kind: 'rectangle' as const,
					worldMatrix: attachment.worldMatrix,
					width: attachment.width,
					height: attachment.height,
					enabled: attachment.enabled
				});
};

const createSelectionGuides = function createSelectionGuides(
	project: Project,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	selectedIds: readonly EntityId[],
	hiddenIds: ReadonlySet<EntityId>,
	pose?: EvaluatedPose
): readonly RenderSelectionGuide[] {
	const selected = new Set(selectedIds);
	const slotsById = new Map(project.slots.map((slot) => [slot.id, slot] as const));
	const boneGuides = project.bones
		.filter((bone) => selected.has(bone.id) && isEditorEntityVisible(project, bone.id, hiddenIds))
		.flatMap((bone) => {
			const matrix = matrixByBone.get(bone.id);

			return matrix
				? [{
					kind: 'bone' as const,
					start: transformPoint(matrix, { x: 0, y: 0 }),
					end: transformPoint(matrix, { x: BONE_PREVIEW_LENGTH, y: 0 })
				}]
				: [];
		});
	const attachmentGuides = project.attachments
		.filter((attachment) => selected.has(attachment.id) && isEditorEntityVisible(project, attachment.id, hiddenIds))
		.flatMap((attachment): readonly RenderSelectionGuide[] => {
			const boneId = attachment.kind === 'image'
				? slotsById.get(attachment.slotId)?.boneId
				: attachment.boneId;
			const boneMatrix = boneId ? matrixByBone.get(boneId) : undefined;

			if (!boneMatrix) {
				return [];
			}

			const evaluated = pose?.attachments.find((candidate) => candidate.id === attachment.id);
			const worldMatrix = pose
				? evaluated?.worldMatrix
				: multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform));

			if (!worldMatrix) {
				return [];
			}

			if (attachment.kind === 'image') {
				const asset = project.assets.find((candidate) => candidate.id === attachment.assetId);

				return asset
					? [{
						kind: 'image' as const,
						worldMatrix,
						x: -attachment.pivotX * asset.width,
						y: -attachment.pivotY * asset.height,
						width: asset.width,
						height: asset.height
					}]
					: [];
			}

			return attachment.kind === 'point'
				? [{ kind: 'point' as const, worldMatrix }]
				: [{
					kind: 'rectangle' as const,
					worldMatrix,
					width: evaluated?.kind === 'rectangle' ? evaluated.width : attachment.width,
					height: evaluated?.kind === 'rectangle' ? evaluated.height : attachment.height
				}];
		});

	return [...boneGuides, ...attachmentGuides];
};

const createTransformHandles = function createTransformHandles(
	project: Project,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	selectedIds: readonly EntityId[],
	tool: FixedCanvasRenderOptions['transformTool'],
	hiddenIds: ReadonlySet<EntityId>,
	pose?: EvaluatedPose
): RenderTransformHandles | undefined {
	if (!tool) {
		return undefined;
	}

	const visibleSelectedIds = selectedIds.filter((id) => isEditorEntityVisible(project, id, hiddenIds));
	const slotsById = new Map(project.slots.map((slot) => [slot.id, slot] as const));
	const centers = visibleSelectedIds.flatMap((selectedId) => {
		const bone = project.bones.find((candidate) => candidate.id === selectedId);

		if (bone) {
			const matrix = matrixByBone.get(bone.id);

			return matrix ? [transformPoint(matrix, { x: 0, y: 0 })] : [];
		}

		const attachment = project.attachments.find((candidate) => candidate.id === selectedId);
		const evaluated = pose?.attachments.find((candidate) => candidate.id === selectedId);
		const boneId = attachment?.kind === 'image'
			? slotsById.get(attachment.slotId)?.boneId
			: attachment?.boneId;
		const boneMatrix = boneId ? matrixByBone.get(boneId) : undefined;
		const worldMatrix = pose
			? evaluated?.worldMatrix
			: attachment && boneMatrix
				? multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform))
				: undefined;

		return worldMatrix ? [transformPoint(worldMatrix, { x: 0, y: 0 })] : [];
	});

	if (centers.length === 0) {
		return undefined;
	}

	const total = centers.reduce(
		(sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }),
		{ x: 0, y: 0 }
	);
	const center = { x: total.x / centers.length, y: total.y / centers.length };
	const selectedAttachment = visibleSelectedIds.length === 1
		? project.attachments.find((attachment) => attachment.id === visibleSelectedIds[0])
		: undefined;
	const selectedRectangle = selectedAttachment?.kind === 'rectangle' ? selectedAttachment : undefined;
	const evaluatedRectangle = selectedRectangle
		? pose?.attachments.find((attachment) => attachment.id === selectedRectangle.id)
		: undefined;
	const rectangleBoneMatrix = selectedRectangle ? matrixByBone.get(selectedRectangle.boneId) : undefined;
	const rectangleWorldMatrix = pose
		? evaluatedRectangle?.kind === 'rectangle' ? evaluatedRectangle.worldMatrix : undefined
		: selectedRectangle && rectangleBoneMatrix
			? multiplyAffine(rectangleBoneMatrix, localTransformToMatrix(selectedRectangle.transform))
			: undefined;
	const rectangleHandlePoints = selectedRectangle && rectangleWorldMatrix
		? {
			right: transformPoint(rectangleWorldMatrix, { x: (evaluatedRectangle?.kind === 'rectangle' ? evaluatedRectangle.width : selectedRectangle.width) / 2, y: 0 }),
			bottom: transformPoint(rectangleWorldMatrix, { x: 0, y: (evaluatedRectangle?.kind === 'rectangle' ? evaluatedRectangle.height : selectedRectangle.height) / 2 })
		}
		: undefined;

	return { tool, center, rectangleHandlePoints };
};

const sceneWith = function sceneWith(
	project: Project,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	images: readonly ImageRenderInstance[],
	gameplayAttachments: readonly RenderGameplayAttachment[],
	options: FixedCanvasRenderOptions,
	showBones: boolean,
	gridSpacing: number | undefined,
	pose?: EvaluatedPose
): RenderScene {
	const hiddenIds = options.hiddenIds ?? new Set<EntityId>();
	const selectedIds = options.selectedIds ?? [];

	return {
		canvas: project.logicalCanvas,
		boneMatrices: matrixByBone,
		images,
		bones: showBones ? createBones(project, matrixByBone, hiddenIds) : [],
		gameplayAttachments,
		selectionGuides: createSelectionGuides(project, matrixByBone, selectedIds, hiddenIds, pose),
		transformHandles: createTransformHandles(project, matrixByBone, selectedIds, options.transformTool, hiddenIds, pose),
		gridSpacing
	};
};

export const createSetupRenderScene = function createSetupRenderScene(
	project: Project,
	options: FixedCanvasRenderOptions = {}
): RendererResult<RenderScene> {
	const projectValidation = projectError(project);

	if (!projectValidation.ok) {
		return projectValidation;
	}

	const evaluation = evaluateBoneWorldMatrices(project);
	const hiddenIds = options.hiddenIds ?? new Set<EntityId>();
	const images = setupImageRenderInstances(project, evaluation.matrices)
		.filter((instance) => isEditorEntityVisible(project, instance.attachment.id, hiddenIds));
	const requestedSpacing = options.gridSpacing ?? DEFAULT_GRID_SPACING;
	const gridSpacing = options.gridVisible !== false && validGridSpacing(requestedSpacing)
		? requestedSpacing
		: undefined;

	return rendererSuccess(sceneWith(
		project,
		evaluation.matrices,
		images,
		createSetupGameplayAttachments(project, evaluation.matrices, options.showGameplay !== false, hiddenIds),
		options,
		options.showBones !== false,
		gridSpacing
	));
};

export const createPoseRenderScene = function createPoseRenderScene(
	project: Project,
	pose: EvaluatedPose,
	options: FixedCanvasRenderOptions = {}
): RendererResult<RenderScene> {
	const projectValidation = projectError(project);

	if (!projectValidation.ok) {
		return projectValidation;
	}

	const hiddenIds = options.hiddenIds ?? new Set<EntityId>();
	const images = poseImageRenderInstances(project, pose)
		.filter((instance) => isEditorEntityVisible(project, instance.attachment.id, hiddenIds));
	const matrices = new Map(pose.bones.map((bone) => [bone.id, bone.worldMatrix] as const));
	const requestedSpacing = options.gridSpacing;
	const gridSpacing = options.gridVisible === true && validGridSpacing(requestedSpacing)
		? requestedSpacing
		: undefined;

	return rendererSuccess(sceneWith(
		project,
		matrices,
		images,
		createPoseGameplayAttachments(project, pose, options.showGameplay === true, hiddenIds),
		options,
		options.showBones === true,
		gridSpacing,
		pose
	));
};

const drawGrid = function drawGrid(
	graphics: Graphics,
	size: CanvasSize,
	spacing: number
): void {
	const verticalPositions = Array.from({ length: Math.floor(size.width / spacing) + 1 }, (_, index) => index * spacing);
	const horizontalPositions = Array.from({ length: Math.floor(size.height / spacing) + 1 }, (_, index) => index * spacing);

	verticalPositions.forEach((x) => graphics.moveTo(x, 0).lineTo(x, size.height));
	horizontalPositions.forEach((y) => graphics.moveTo(0, y).lineTo(size.width, y));
	graphics.stroke({ width: 1, color: 0x293342, alpha: 0.5 });
};

const addImageSprites = function addImageSprites(
	container: Container,
	preparedImages: readonly PreparedImage[]
): void {
	preparedImages.forEach((prepared) => {
		const sprite = new Sprite({
			texture: prepared.texture,
			anchor: {
				x: prepared.instance.attachment.pivotX,
				y: prepared.instance.attachment.pivotY
			}
		});

		sprite.setFromMatrix(pixiMatrix(prepared.instance.worldMatrix));
		sprite.alpha = prepared.instance.opacity;
		container.addChild(sprite);
	});
};

const drawGameplayAttachment = function drawGameplayAttachment(
	container: Container,
	attachment: RenderGameplayAttachment
): void {
	const graphics = new Graphics();
	const alpha = attachment.enabled ? 0.85 : 0.3;

	if (attachment.kind === 'point') {
		graphics.moveTo(-8, 0).lineTo(8, 0).moveTo(0, -8).lineTo(0, 8).circle(0, 0, 5)
			.stroke({ width: 2, color: 0xf0b86d, alpha });
	} else {
		graphics.rect(-attachment.width / 2, -attachment.height / 2, attachment.width, attachment.height)
			.fill({ color: 0xf0b86d, alpha: attachment.enabled ? 0.18 : 0.06 })
			.stroke({ width: 2, color: 0xf0b86d, alpha });
	}

	graphics.setFromMatrix(pixiMatrix(attachment.worldMatrix));
	container.addChild(graphics);
};

const drawSelectionGuide = function drawSelectionGuide(
	container: Container,
	guide: RenderSelectionGuide
): void {
	const graphics = new Graphics();

	if (guide.kind === 'bone') {
		graphics.moveTo(guide.start.x, guide.start.y).lineTo(guide.end.x, guide.end.y).circle(guide.start.x, guide.start.y, 7)
			.stroke({ width: 2, color: 0xffd27d, alpha: 0.95 });
	} else {
		if (guide.kind === 'image') {
			graphics.rect(guide.x, guide.y, guide.width, guide.height);
		} else if (guide.kind === 'point') {
			graphics.moveTo(-11, 0).lineTo(11, 0).moveTo(0, -11).lineTo(0, 11).circle(0, 0, 9);
		} else {
			graphics.rect(-guide.width / 2, -guide.height / 2, guide.width, guide.height);
		}

		graphics.stroke({ width: 2, color: 0xffd27d, alpha: 0.95 });
		graphics.setFromMatrix(pixiMatrix(guide.worldMatrix));
	}

	container.addChild(graphics);
};

const drawTranslateHandles = function drawTranslateHandles(
	graphics: Graphics,
	handles: RenderTransformHandles
): void {
	graphics.moveTo(handles.center.x - 18, handles.center.y).lineTo(handles.center.x + 18, handles.center.y)
		.moveTo(handles.center.x, handles.center.y - 18).lineTo(handles.center.x, handles.center.y + 18)
		.circle(handles.center.x, handles.center.y, 5);
};

const drawRotateHandles = function drawRotateHandles(
	graphics: Graphics,
	handles: RenderTransformHandles
): void {
	graphics.circle(handles.center.x, handles.center.y, 30).circle(handles.center.x, handles.center.y, 5);
};

const drawScaleHandles = function drawScaleHandles(
	graphics: Graphics,
	handles: RenderTransformHandles
): void {
	const points = handles.rectangleHandlePoints;

	if (points) {
		graphics.moveTo(handles.center.x, handles.center.y).lineTo(points.right.x, points.right.y)
			.moveTo(handles.center.x, handles.center.y).lineTo(points.bottom.x, points.bottom.y)
			.circle(points.right.x, points.right.y, 6)
			.circle(points.bottom.x, points.bottom.y, 6);
		return;
	}

	graphics.moveTo(handles.center.x, handles.center.y).lineTo(handles.center.x + 38, handles.center.y)
		.moveTo(handles.center.x, handles.center.y).lineTo(handles.center.x, handles.center.y + 38)
		.rect(handles.center.x + 32, handles.center.y - 6, 12, 12)
		.rect(handles.center.x - 6, handles.center.y + 32, 12, 12);
};

const drawShearHandles = function drawShearHandles(
	graphics: Graphics,
	handles: RenderTransformHandles
): void {
	graphics.moveTo(handles.center.x - 22, handles.center.y).lineTo(handles.center.x + 22, handles.center.y)
		.moveTo(handles.center.x, handles.center.y - 22).lineTo(handles.center.x, handles.center.y + 22);
};

const drawTransformHandles = function drawTransformHandles(
	container: Container,
	handles: RenderTransformHandles | undefined
): void {
	if (!handles) {
		return;
	}

	const graphics = new Graphics();
	const drawByTool: Readonly<Record<RenderTransformHandles['tool'], (target: Graphics, value: RenderTransformHandles) => void>> = {
		translate: drawTranslateHandles,
		rotate: drawRotateHandles,
		scale: drawScaleHandles,
		shear: drawShearHandles
	};

	drawByTool[handles.tool](graphics, handles);
	graphics.stroke({ width: 2, color: 0x9ae8d4, alpha: 0.95 });
	container.addChild(graphics);
};

export const renderSceneToContainer = function renderSceneToContainer(
	container: Container,
	scene: RenderScene,
	preparedImages: readonly PreparedImage[]
): void {
	if (scene.gridSpacing !== undefined) {
		const grid = new Graphics();
		drawGrid(grid, scene.canvas, scene.gridSpacing);
		container.addChild(grid);
	}

	const attachments = new Container();
	addImageSprites(attachments, preparedImages);
	scene.gameplayAttachments.forEach((attachment) => drawGameplayAttachment(attachments, attachment));
	container.addChild(attachments);

	if (scene.bones.length > 0) {
		const bones = new Graphics();
		scene.bones.forEach((bone) => {
			bones.moveTo(bone.start.x, bone.start.y).lineTo(bone.end.x, bone.end.y).circle(bone.start.x, bone.start.y, 4);
		});
		bones.stroke({ width: 3, color: 0x6fd4bd, alpha: 0.92, cap: 'round' });
		bones.fill({ color: 0x9ae8d4, alpha: 0.95 });
		container.addChild(bones);
	}

	const selection = new Container();
	scene.selectionGuides.forEach((guide) => drawSelectionGuide(selection, guide));
	drawTransformHandles(selection, scene.transformHandles);
	container.addChild(selection);
};
