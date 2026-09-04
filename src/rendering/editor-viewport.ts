import { Application, Container, Graphics, Matrix } from 'pixi.js';
import { identityMatrix, type AffineMatrix } from '../domain/coordinates.ts';
import type { CanvasSize, Project } from '../domain/model.ts';
import type { EvaluatedPose } from '../domain/pose.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import { createImageResourceStore } from './image-resources.ts';
import { createPoseRenderScene, createSetupRenderScene, renderSceneToContainer, type RenderScene } from './render-scene.ts';
import { rendererFailure, rendererSuccess, type FixedCanvasRenderOptions, type RendererResult } from './renderer-types.ts';

export type EditorViewportDimensions = Readonly<{
	/** Width of the viewport in CSS pixels. */
	width: number;
	/** Height of the viewport in CSS pixels. */
	height: number;
	/** Device-pixel ratio used for the backing canvas. */
	resolution?: number;
}>;

export type EditorViewportCamera = Readonly<{
	/** CSS pixels per logical world pixel. */
	scale: number;
	/** Screen-pixel offset from centered logical-canvas placement. */
	offsetX: number;
	/** Screen-pixel offset from centered logical-canvas placement. */
	offsetY: number;
}>;

export type EditorViewportRenderer = Readonly<{
	canvas: HTMLCanvasElement;
	/** Resize the screen and backing store without rebuilding image textures. */
	resize: (dimensions: EditorViewportDimensions) => RendererResult<void>;
	/** Apply the plan camera contract for a logical canvas. */
	setCamera: (camera: EditorViewportCamera, logicalCanvas: CanvasSize) => RendererResult<void>;
	/** Apply an arbitrary world-to-screen transform for future camera integration. */
	setWorldTransform: (transform: AffineMatrix) => RendererResult<void>;
	renderSetup: (project: Project, assets: ProjectAssetBlobs, options?: FixedCanvasRenderOptions) => Promise<RendererResult<void>>;
	renderPose: (project: Project, pose: EvaluatedPose, assets: ProjectAssetBlobs, options?: FixedCanvasRenderOptions) => Promise<RendererResult<void>>;
	destroy: () => void;
}>;

type NormalizedDimensions = Readonly<{
	width: number;
	height: number;
	resolution: number;
}>;

type EditorOverlay = {
	boundary: Graphics;
	origin: Graphics | undefined;
};

type RendererState = {
	content: Container;
	overlay: EditorOverlay | undefined;
	dimensions: NormalizedDimensions;
	logicalCanvas: CanvasSize | undefined;
	camera: EditorViewportCamera | undefined;
	worldTransform: AffineMatrix;
	requestId: number;
	destroyed: boolean;
};

const DEFAULT_VIEWPORT_DIMENSIONS = {
	width: 1,
	height: 1,
	resolution: 1
} as const satisfies NormalizedDimensions;

const CHECKERBOARD_CELL_SIZE = 16;
const CHECKERBOARD_LIGHT = 0x27313d;
const CHECKERBOARD_DARK = 0x1f2833;

const positiveFinite = function positiveFinite(value: number | undefined, fallback: number): number {
	return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
};

const normalizeDimensions = function normalizeDimensions(
	dimensions: EditorViewportDimensions
): NormalizedDimensions {
	return {
		width: positiveFinite(dimensions.width, DEFAULT_VIEWPORT_DIMENSIONS.width),
		height: positiveFinite(dimensions.height, DEFAULT_VIEWPORT_DIMENSIONS.height),
		resolution: positiveFinite(dimensions.resolution, DEFAULT_VIEWPORT_DIMENSIONS.resolution)
	};
};

const isValidCanvasSize = function isValidCanvasSize(size: CanvasSize): boolean {
	return Number.isInteger(size.width)
		&& Number.isInteger(size.height)
		&& size.width > 0
		&& size.height > 0;
};

const isValidCamera = function isValidCamera(camera: EditorViewportCamera): boolean {
	return Number.isFinite(camera.scale)
		&& camera.scale > 0
		&& Number.isFinite(camera.offsetX)
		&& Number.isFinite(camera.offsetY);
};

const isFiniteTransform = function isFiniteTransform(transform: AffineMatrix): boolean {
	return [transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty].every(Number.isFinite);
};

const pixiMatrix = function pixiMatrix(transform: AffineMatrix): Matrix {
	return new Matrix(transform.a, transform.b, transform.c, transform.d, transform.tx, transform.ty);
};

const cameraTransform = function cameraTransform(
	camera: EditorViewportCamera,
	logicalCanvas: CanvasSize,
	dimensions: NormalizedDimensions
): AffineMatrix {
	return {
		a: camera.scale,
		b: 0,
		c: 0,
		d: camera.scale,
		tx: (dimensions.width - logicalCanvas.width * camera.scale) / 2 + camera.offsetX,
		ty: (dimensions.height - logicalCanvas.height * camera.scale) / 2 + camera.offsetY
	};
};

const effectiveScale = function effectiveScale(transform: AffineMatrix): number {
	const primaryScale = Math.hypot(transform.a, transform.b);
	const secondaryScale = Math.hypot(transform.c, transform.d);

	return Math.max(primaryScale, secondaryScale, Number.EPSILON);
};

const drawCheckerboard = function drawCheckerboard(
	graphics: Graphics,
	size: CanvasSize
): void {
	const columns = Math.ceil(size.width / CHECKERBOARD_CELL_SIZE);
	const rows = Math.ceil(size.height / CHECKERBOARD_CELL_SIZE);

	Array.from({ length: columns * rows }, (_, index) => {
		const column = index % columns;
		const row = Math.floor(index / columns);
		const x = column * CHECKERBOARD_CELL_SIZE;
		const y = row * CHECKERBOARD_CELL_SIZE;
		const width = Math.min(CHECKERBOARD_CELL_SIZE, size.width - x);
		const height = Math.min(CHECKERBOARD_CELL_SIZE, size.height - y);

		return graphics.rect(x, y, width, height).fill({
			color: (column + row) % 2 === 0 ? CHECKERBOARD_LIGHT : CHECKERBOARD_DARK
		});
	});
};

const updateOverlay = function updateOverlay(
	overlay: EditorOverlay | undefined,
	size: CanvasSize,
	transform: AffineMatrix,
	showOrigin: boolean
): void {
	if (!overlay) {
		return;
	}

	const strokeWidth = 1 / effectiveScale(transform);

	overlay.boundary.clear().rect(0, 0, size.width, size.height)
		.stroke({ width: strokeWidth, color: 0x6fd4bd, alpha: 0.8 });
	overlay.origin?.clear();

	if (showOrigin && overlay.origin) {
		overlay.origin.moveTo(-16, 0).lineTo(16, 0).moveTo(0, -16).lineTo(0, 16).circle(0, 0, 5)
			.stroke({ width: strokeWidth * 2, color: 0x9ae8d4, alpha: 0.95 });
	}
};

const createOverlay = function createOverlay(
	size: CanvasSize,
	transform: AffineMatrix,
	showOrigin: boolean
): EditorOverlay {
	const overlay = {
		boundary: new Graphics(),
		origin: showOrigin ? new Graphics() : undefined
	};

	updateOverlay(overlay, size, transform, showOrigin);

	return overlay;
};

export const createEditorViewportRenderer = async function createEditorViewportRenderer(
	host: HTMLElement,
	dimensions: EditorViewportDimensions = DEFAULT_VIEWPORT_DIMENSIONS
): Promise<RendererResult<EditorViewportRenderer>> {
	if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
		return rendererFailure('unsupported-browser', 'This browser cannot create a canvas renderer.');
	}

	const initialDimensions = normalizeDimensions(dimensions);

	try {
		const application = new Application();
		await application.init({
			width: initialDimensions.width,
			height: initialDimensions.height,
			resolution: initialDimensions.resolution,
			autoDensity: true,
			autoStart: false,
			sharedTicker: false,
			antialias: true,
			backgroundAlpha: 0,
			clearBeforeRender: true,
			preserveDrawingBuffer: true,
			preference: 'webgl'
		});
		const canvas = application.canvas;
		canvas.className = 'pixi-canvas editor-pixi-canvas';
		host.replaceChildren(canvas);
		const world = new Container();
		const content = new Container();
		const state: RendererState = {
			content,
			overlay: undefined,
			dimensions: initialDimensions,
			logicalCanvas: undefined,
			camera: undefined,
			worldTransform: identityMatrix(),
			requestId: 0,
			destroyed: false
		};

		world.addChild(content);
		application.stage.addChild(world);
		const resources = createImageResourceStore();

		const applyWorldTransform = function applyWorldTransform(transform: AffineMatrix): void {
			const ownedTransform = { ...transform };

			state.worldTransform = ownedTransform;
			world.setFromMatrix(pixiMatrix(ownedTransform));
			updateOverlay(state.overlay, state.logicalCanvas ?? { width: 1, height: 1 }, ownedTransform, state.overlay?.origin !== undefined);
		};

		const replaceContent = function replaceContent(): Container {
			const nextContent = new Container();
			world.removeChild(state.content);
			state.content.destroy({ children: true });
			resources.releaseRetired();
			state.content = nextContent;
			state.overlay = undefined;
			world.addChild(nextContent);

			return nextContent;
		};

		const nextRequestId = function nextRequestId(): number {
			state.requestId += 1;

			return state.requestId;
		};

		const renderBuiltScene = async function renderBuiltScene(
			requestId: number,
			project: Project,
			assets: ProjectAssetBlobs,
			showOrigin: boolean,
			build: () => RendererResult<RenderScene>
		): Promise<RendererResult<void>> {
			if (state.destroyed) {
				return rendererFailure('renderer-failure', 'The canvas renderer has been destroyed.');
			}

			const scene = build();

			if (!scene.ok) {
				return scene;
			}

			const prepared = await resources.prepare(project, assets, scene.value.images);

			if (state.destroyed || state.requestId !== requestId) {
				return rendererSuccess(undefined);
			}
			if (!prepared.ok) {
				return prepared;
			}

			state.logicalCanvas = scene.value.canvas;

			if (state.camera) {
				applyWorldTransform(cameraTransform(state.camera, scene.value.canvas, state.dimensions));
			}

			const nextContent = replaceContent();
			const background = new Graphics();
			drawCheckerboard(background, scene.value.canvas);
			nextContent.addChild(background);
			renderSceneToContainer(nextContent, scene.value, prepared.value);
			const overlay = createOverlay(scene.value.canvas, state.worldTransform, showOrigin);
			nextContent.addChild(overlay.boundary);

			if (overlay.origin) {
				nextContent.addChild(overlay.origin);
			}

			state.overlay = overlay;
			application.render();

			return rendererSuccess(undefined);
		};

		const resize = function resize(
			nextDimensions: EditorViewportDimensions
		): RendererResult<void> {
			if (state.destroyed) {
				return rendererFailure('renderer-failure', 'The canvas renderer has been destroyed.');
			}

			const normalized = normalizeDimensions(nextDimensions);

			try {
				application.renderer.resize(normalized.width, normalized.height, normalized.resolution);
				state.dimensions = normalized;

				if (state.camera && state.logicalCanvas) {
					applyWorldTransform(cameraTransform(state.camera, state.logicalCanvas, normalized));
				}

				application.render();

				return rendererSuccess(undefined);
			} catch (error: unknown) {
				return rendererFailure('renderer-failure', error instanceof Error ? error.message : 'Viewport renderer resize failed.');
			}
		};

		const setCamera = function setCamera(
			camera: EditorViewportCamera,
			logicalCanvas: CanvasSize
		): RendererResult<void> {
			if (state.destroyed) {
				return rendererFailure('renderer-failure', 'The canvas renderer has been destroyed.');
			}
			if (!isValidCamera(camera)) {
				return rendererFailure('renderer-failure', 'Viewport camera values must be finite and positive.');
			}
			if (!isValidCanvasSize(logicalCanvas)) {
				return rendererFailure('renderer-failure', 'Logical canvas dimensions must be positive integers.');
			}

			const ownedCamera = { ...camera };
			const ownedLogicalCanvas = { ...logicalCanvas };

			state.camera = ownedCamera;
			state.logicalCanvas = ownedLogicalCanvas;
			applyWorldTransform(cameraTransform(ownedCamera, ownedLogicalCanvas, state.dimensions));
			application.render();

			return rendererSuccess(undefined);
		};

		const setWorldTransform = function setWorldTransform(
			transform: AffineMatrix
		): RendererResult<void> {
			if (state.destroyed) {
				return rendererFailure('renderer-failure', 'The canvas renderer has been destroyed.');
			}
			if (!isFiniteTransform(transform)) {
				return rendererFailure('renderer-failure', 'World transform values must be finite.');
			}

			state.camera = undefined;
			applyWorldTransform(transform);
			application.render();

			return rendererSuccess(undefined);
		};

		const renderSetup = async function renderSetup(
			project: Project,
			assets: ProjectAssetBlobs,
			options: FixedCanvasRenderOptions = {}
		): Promise<RendererResult<void>> {
			const requestId = nextRequestId();

			return renderBuiltScene(requestId, project, assets, true, () => createSetupRenderScene(project, options));
		};

		const renderPose = async function renderPose(
			project: Project,
			pose: EvaluatedPose,
			assets: ProjectAssetBlobs,
			options: FixedCanvasRenderOptions = {}
		): Promise<RendererResult<void>> {
			const requestId = nextRequestId();

			return renderBuiltScene(requestId, project, assets, false, () => createPoseRenderScene(project, pose, options));
		};

		const destroy = function destroy(): void {
			if (state.destroyed) {
				return;
			}

			state.destroyed = true;
			state.requestId += 1;
			resources.destroy();
			application.destroy({ removeView: true }, false);
		};

		return rendererSuccess({
			canvas,
			resize,
			setCamera,
			setWorldTransform,
			renderSetup,
			renderPose,
			destroy
		});
	} catch (error: unknown) {
		return rendererFailure('renderer-failure', error instanceof Error ? error.message : 'Pixi renderer initialization failed.');
	}
};
