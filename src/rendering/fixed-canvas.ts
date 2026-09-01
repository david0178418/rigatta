import { Application, Container, Graphics, Matrix, Sprite, Texture } from 'pixi.js';
import { decodeImageBlob } from '../assets/images.ts';
import { localTransformToMatrix, multiplyAffine, transformPoint, type AffineMatrix } from '../domain/coordinates.ts';
import type { Attachment, CanvasSize, ImageAttachment, Project } from '../domain/model.ts';
import type { EntityId } from '../domain/ids.ts';
import { evaluateBoneWorldMatrices } from '../domain/transforms.ts';
import { validateProject } from '../domain/validation.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';

export type RendererError = Readonly<{
	code: 'unsupported-browser' | 'invalid-project' | 'invalid-asset' | 'renderer-failure';
	message: string;
}>;

export type RendererResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: RendererError }>;

export type FixedCanvasRenderOptions = Readonly<{
	gridVisible?: boolean;
	gridSpacing?: number;
	showBones?: boolean;
	showGameplay?: boolean;
	selectedIds?: readonly EntityId[];
	transformTool?: 'translate' | 'rotate' | 'scale' | 'shear';
}>;

export type FixedCanvasRenderer = Readonly<{
	canvas: HTMLCanvasElement;
	renderSetup: (project: Project, assets: ProjectAssetBlobs, options?: FixedCanvasRenderOptions) => Promise<RendererResult<void>>;
	capturePng: () => Promise<RendererResult<Blob>>;
	destroy: () => void;
}>;

type PreparedImage = Readonly<{
	attachment: ImageAttachment;
	bitmap: ImageBitmap;
	texture: Texture;
}>;

type RendererState = {
	content: Container;
	resources: readonly PreparedImage[];
	destroyed: boolean;
};

const DEFAULT_GRID_SPACING = 32;
const BONE_PREVIEW_LENGTH = 56;

const success = function success<TValue>(value: TValue): RendererResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(
	code: RendererError['code'],
	message: string
): RendererResult<never> {
	return { ok: false, error: { code, message } };
};

const isValidCanvasSize = function isValidCanvasSize(size: CanvasSize): boolean {
	return Number.isInteger(size.width)
		&& Number.isInteger(size.height)
		&& size.width > 0
		&& size.height > 0;
};

const pixiMatrix = function pixiMatrix(matrix: AffineMatrix): Matrix {
	return new Matrix(matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty);
};

const clearResources = function clearResources(state: RendererState): void {
	state.resources.forEach((resource) => {
		resource.texture.destroy(true);
		resource.bitmap.close();
	});
	state.resources = [];
};

const replaceContent = function replaceContent(
	application: Application,
	state: RendererState
): Container {
	clearResources(state);
	application.stage.removeChild(state.content);
	state.content.destroy({ children: true });
	const content = new Container();

	state.content = content;
	application.stage.addChild(content);

	return content;
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

const drawBones = function drawBones(
	graphics: Graphics,
	project: Project,
	matrixByBone: ReadonlyMap<string, AffineMatrix>
): void {
	project.bones.forEach((bone) => {
		const matrix = matrixByBone.get(bone.id);

		if (!matrix) {
			return;
		}

		const start = transformPoint(matrix, { x: 0, y: 0 });
		const end = transformPoint(matrix, { x: BONE_PREVIEW_LENGTH, y: 0 });

		graphics.moveTo(start.x, start.y).lineTo(end.x, end.y).circle(start.x, start.y, 4);
	});
	graphics.stroke({ width: 3, color: 0x6fd4bd, alpha: 0.92, cap: 'round' });
	graphics.fill({ color: 0x9ae8d4, alpha: 0.95 });
};

const findActiveAttachments = function findActiveAttachments(project: Project): readonly Attachment[] {
	const attachmentsById = new Map(project.attachments.map((attachment) => [attachment.id, attachment] as const));
	const slotsById = new Map(project.slots.map((slot) => [slot.id, slot] as const));

	return project.setupDrawOrder.flatMap((slotId) => {
		const slot = slotsById.get(slotId);
		const attachment = slot?.setupAttachmentId ? attachmentsById.get(slot.setupAttachmentId) : undefined;

		return attachment ? [attachment] : [];
	});
};

const prepareImages = async function prepareImages(
	project: Project,
	assets: ProjectAssetBlobs,
	activeAttachments: readonly Attachment[]
): Promise<RendererResult<readonly PreparedImage[]>> {
	const imageAttachments = activeAttachments.flatMap((attachment) => attachment.kind === 'image' ? [attachment] : []);
	const prepared = await Promise.all(imageAttachments.map(async (attachment): Promise<RendererResult<PreparedImage>> => {
		const asset = project.assets.find((candidate) => candidate.id === attachment.assetId);
		const blob = asset ? assets.get(asset.id) : undefined;

		if (!asset || !blob) {
			return failure('invalid-asset', `Image asset for attachment ${attachment.id} is unavailable.`);
		}

		const decoded = await decodeImageBlob(blob, asset.mimeType);

		if (!decoded.ok) {
			return failure('invalid-asset', `${asset.relativePath}: ${decoded.error}`);
		}

		return success({
			attachment,
			bitmap: decoded.value.bitmap,
			texture: Texture.from(decoded.value.bitmap)
		});
	}));
	const failed = prepared.find((result) => !result.ok);

	if (failed && !failed.ok) {
		prepared.filter((result): result is Readonly<{ ok: true; value: PreparedImage }> => result.ok).forEach((result) => {
			result.value.texture.destroy(true);
			result.value.bitmap.close();
		});

		return failed;
	}

	return success(prepared.flatMap((result) => result.ok ? [result.value] : []));
};

const addImageSprites = function addImageSprites(
	container: Container,
	preparedImages: readonly PreparedImage[],
	matrixByBone: ReadonlyMap<string, AffineMatrix>,
	project: Project
): void {
	const slotById = new Map(project.slots.map((slot) => [slot.id, slot] as const));

	preparedImages.forEach((prepared) => {
		const slot = slotById.get(prepared.attachment.slotId);

		if (!slot) {
			return;
		}

		const boneMatrix = matrixByBone.get(slot.boneId);

		if (!boneMatrix) {
			return;
		}

		const worldMatrix = multiplyAffine(boneMatrix, localTransformToMatrix(prepared.attachment.transform));
		const sprite = new Sprite({
			texture: prepared.texture,
			anchor: { x: prepared.attachment.pivotX, y: prepared.attachment.pivotY }
		});

		sprite.setFromMatrix(pixiMatrix(worldMatrix));
		sprite.alpha = prepared.attachment.opacity;
		container.addChild(sprite);
	});
};

const addGameplayAttachments = function addGameplayAttachments(
	container: Container,
	project: Project,
	matrixByBone: ReadonlyMap<string, AffineMatrix>,
	showGameplay: boolean
): void {
	if (!showGameplay) {
		return;
	}

	project.attachments
		.filter((attachment) => attachment.kind !== 'image')
		.forEach((attachment) => {
			const boneId = attachment.boneId;
			const boneMatrix = matrixByBone.get(boneId);

			if (!boneMatrix || !attachment.enabled) {
				return;
			}

			const worldMatrix = multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform));
			const graphics = new Graphics();

			if (attachment.kind === 'point') {
				graphics.circle(0, 0, 6).fill({ color: 0xf0b86d, alpha: 0.85 });
			} else {
				graphics.rect(-attachment.width / 2, -attachment.height / 2, attachment.width, attachment.height)
					.fill({ color: 0xf0b86d, alpha: 0.18 })
					.stroke({ width: 2, color: 0xf0b86d, alpha: 0.9 });
			}

			graphics.setFromMatrix(pixiMatrix(worldMatrix));
			container.addChild(graphics);
	});
};

const addSelectionGuides = function addSelectionGuides(
	container: Container,
	project: Project,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	selectedIds: readonly EntityId[]
): void {
	const selected = new Set(selectedIds);
	const slotsById = new Map(project.slots.map((slot) => [slot.id, slot] as const));

	project.bones.filter((bone) => selected.has(bone.id)).forEach((bone) => {
		const matrix = matrixByBone.get(bone.id);

		if (!matrix) {
			return;
		}

		const guide = new Graphics();
		const start = transformPoint(matrix, { x: 0, y: 0 });
		const end = transformPoint(matrix, { x: BONE_PREVIEW_LENGTH, y: 0 });

		guide.moveTo(start.x, start.y).lineTo(end.x, end.y).circle(start.x, start.y, 7)
			.stroke({ width: 2, color: 0xffd27d, alpha: 0.95 });
		container.addChild(guide);
	});

	project.attachments.filter((attachment) => selected.has(attachment.id)).forEach((attachment) => {
		const boneId = attachment.kind === 'image'
			? slotsById.get(attachment.slotId)?.boneId
			: attachment.boneId;
		const boneMatrix = boneId ? matrixByBone.get(boneId) : undefined;

		if (!boneMatrix || (attachment.kind !== 'image' && !attachment.enabled)) {
			return;
		}

		const worldMatrix = multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform));
		const guide = new Graphics();

		if (attachment.kind === 'image') {
			const asset = project.assets.find((candidate) => candidate.id === attachment.assetId);

			if (!asset) {
				return;
			}

			guide.rect(-attachment.pivotX * asset.width, -attachment.pivotY * asset.height, asset.width, asset.height);
		} else if (attachment.kind === 'point') {
			guide.circle(0, 0, 9);
		} else {
			guide.rect(-attachment.width / 2, -attachment.height / 2, attachment.width, attachment.height);
		}

		guide.stroke({ width: 2, color: 0xffd27d, alpha: 0.95 });
		guide.setFromMatrix(pixiMatrix(worldMatrix));
		container.addChild(guide);
	});
};

const addTransformHandles = function addTransformHandles(
	container: Container,
	project: Project,
	matrixByBone: ReadonlyMap<EntityId, AffineMatrix>,
	selectedIds: readonly EntityId[],
	tool: FixedCanvasRenderOptions['transformTool']
): void {
	if (selectedIds.length !== 1 || !tool) {
		return;
	}

	const selectedId = selectedIds[0];
	const bone = project.bones.find((candidate) => candidate.id === selectedId);
	const attachment = project.attachments.find((candidate) => candidate.id === selectedId);
	const centerMatrix = bone
		? matrixByBone.get(bone.id)
		: attachment
			? attachment.kind === 'image'
			? ((): AffineMatrix | undefined => {
					const slot = project.slots.find((candidate) => candidate.id === attachment.slotId);
					const boneMatrix = slot ? matrixByBone.get(slot.boneId) : undefined;

					return boneMatrix ? multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform)) : undefined;
				})()
				: ((): AffineMatrix | undefined => {
					const boneMatrix = matrixByBone.get(attachment.boneId);

					return boneMatrix ? multiplyAffine(boneMatrix, localTransformToMatrix(attachment.transform)) : undefined;
				})()
			: undefined;

	if (!centerMatrix) {
		return;
	}

	const center = transformPoint(centerMatrix, { x: 0, y: 0 });
	const handles = new Graphics();

	if (tool === 'translate') {
		handles.moveTo(center.x - 18, center.y).lineTo(center.x + 18, center.y)
			.moveTo(center.x, center.y - 18).lineTo(center.x, center.y + 18)
			.circle(center.x, center.y, 5);
	} else if (tool === 'rotate') {
		handles.circle(center.x, center.y, 30).circle(center.x, center.y, 5);
	} else if (tool === 'scale') {
		handles.moveTo(center.x, center.y).lineTo(center.x + 38, center.y)
			.moveTo(center.x, center.y).lineTo(center.x, center.y + 38)
			.rect(center.x + 32, center.y - 6, 12, 12)
			.rect(center.x - 6, center.y + 32, 12, 12);
	} else {
		handles.moveTo(center.x - 22, center.y).lineTo(center.x + 22, center.y)
			.moveTo(center.x, center.y - 22).lineTo(center.x, center.y + 22);
	}

	handles.stroke({ width: 2, color: 0x9ae8d4, alpha: 0.95 });
	container.addChild(handles);
};

const captureCanvasPng = async function captureCanvasPng(
	canvas: HTMLCanvasElement
): Promise<RendererResult<Blob>> {
	try {
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Canvas PNG extraction returned no data.')), 'image/png');
		});

		return success(blob);
	} catch (error: unknown) {
		return failure('renderer-failure', error instanceof Error ? error.message : 'Canvas PNG extraction failed.');
	}
};

export const createFixedCanvasRenderer = async function createFixedCanvasRenderer(
	host: HTMLElement,
	size: CanvasSize
): Promise<RendererResult<FixedCanvasRenderer>> {
	if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
		return failure('unsupported-browser', 'This browser cannot create a canvas renderer.');
	}
	if (!isValidCanvasSize(size)) {
		return failure('renderer-failure', 'Logical canvas dimensions must be positive integers.');
	}

	try {
		const application = new Application();
		await application.init({
			width: size.width,
			height: size.height,
			resolution: 1,
			autoDensity: false,
			autoStart: false,
			sharedTicker: false,
			antialias: true,
			backgroundAlpha: 0,
			clearBeforeRender: true,
			preserveDrawingBuffer: true,
			preference: 'webgl'
		});
		const canvas = application.canvas;
		canvas.className = 'pixi-canvas';
		host.replaceChildren(canvas);
		const state: RendererState = {
			content: new Container(),
			resources: [],
			destroyed: false
		};

		application.stage.addChild(state.content);

		const renderSetup = async function renderSetup(
			project: Project,
			assets: ProjectAssetBlobs,
			options: FixedCanvasRenderOptions = {}
		): Promise<RendererResult<void>> {
			if (state.destroyed) {
				return failure('renderer-failure', 'The canvas renderer has been destroyed.');
			}

			const diagnostics = validateProject(project);

			if (diagnostics.length > 0) {
				return failure('invalid-project', diagnostics[0]?.message ?? 'Project validation failed.');
			}

			const activeAttachments = findActiveAttachments(project);
			const prepared = await prepareImages(project, assets, activeAttachments);

			if (!prepared.ok) {
				return prepared;
			}

			const evaluation = evaluateBoneWorldMatrices(project);
			const content = replaceContent(application, state);
			const gridSpacing = options.gridSpacing ?? DEFAULT_GRID_SPACING;
			const grid = new Graphics();

			if (options.gridVisible !== false && Number.isFinite(gridSpacing) && gridSpacing > 0) {
				drawGrid(grid, size, gridSpacing);
			}

			content.addChild(grid);
			const attachments = new Container();

			addImageSprites(attachments, prepared.value, evaluation.matrices, project);
			addGameplayAttachments(attachments, project, evaluation.matrices, options.showGameplay ?? true);
			content.addChild(attachments);

			if (options.showBones !== false) {
				const bones = new Graphics();
				drawBones(bones, project, evaluation.matrices);
				content.addChild(bones);
			}

			const selection = new Container();
			addSelectionGuides(selection, project, evaluation.matrices, options.selectedIds ?? []);
			addTransformHandles(selection, project, evaluation.matrices, options.selectedIds ?? [], options.transformTool);
			content.addChild(selection);

			state.resources = prepared.value;
			application.render();

			return success(undefined);
		};

		const destroy = function destroy(): void {
			if (state.destroyed) {
				return;
			}

			state.destroyed = true;
			clearResources(state);
			application.destroy(true, true);
		};

		return success({
			canvas,
			renderSetup,
			capturePng: () => captureCanvasPng(canvas),
			destroy
		});
	} catch (error: unknown) {
		return failure('renderer-failure', error instanceof Error ? error.message : 'Pixi renderer initialization failed.');
	}
};
