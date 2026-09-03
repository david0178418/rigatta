import { Application, Container } from 'pixi.js';
import type { CanvasSize, Project } from '../domain/model.ts';
import type { EvaluatedPose } from '../domain/pose.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import { createImageResourceStore } from './image-resources.ts';
import { createPoseRenderScene, createSetupRenderScene, renderSceneToContainer, type RenderScene } from './render-scene.ts';
import { rendererFailure, rendererSuccess, type FixedCanvasRenderOptions, type RendererResult } from './renderer-types.ts';

export type { FixedCanvasRenderOptions, RendererError, RendererResult } from './renderer-types.ts';

export type FixedCanvasRenderer = Readonly<{
	canvas: HTMLCanvasElement;
	renderSetup: (project: Project, assets: ProjectAssetBlobs, options?: FixedCanvasRenderOptions) => Promise<RendererResult<void>>;
	renderPose: (project: Project, pose: EvaluatedPose, assets: ProjectAssetBlobs, options?: FixedCanvasRenderOptions) => Promise<RendererResult<void>>;
	capturePng: () => Promise<RendererResult<Blob>>;
	destroy: () => void;
}>;

type RendererState = {
	content: Container;
	requestId: number;
	destroyed: boolean;
};

const isValidCanvasSize = function isValidCanvasSize(size: CanvasSize): boolean {
	return Number.isInteger(size.width)
		&& Number.isInteger(size.height)
		&& size.width > 0
		&& size.height > 0;
};

const captureCanvasPng = async function captureCanvasPng(
	canvas: HTMLCanvasElement
): Promise<RendererResult<Blob>> {
	try {
		const blob = await new Promise<Blob>((resolve, reject) => {
			canvas.toBlob((result) => result ? resolve(result) : reject(new Error('Canvas PNG extraction returned no data.')), 'image/png');
		});

		return rendererSuccess(blob);
	} catch (error: unknown) {
		return rendererFailure('renderer-failure', error instanceof Error ? error.message : 'Canvas PNG extraction failed.');
	}
};

export const createFixedCanvasRenderer = async function createFixedCanvasRenderer(
	host: HTMLElement,
	size: CanvasSize
): Promise<RendererResult<FixedCanvasRenderer>> {
	if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') {
		return rendererFailure('unsupported-browser', 'This browser cannot create a canvas renderer.');
	}
	if (!isValidCanvasSize(size)) {
		return rendererFailure('renderer-failure', 'Logical canvas dimensions must be positive integers.');
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
			requestId: 0,
			destroyed: false
		};
		const resources = createImageResourceStore();

		application.stage.addChild(state.content);

		const replaceContent = function replaceContent(): Container {
			const content = new Container();
			application.stage.removeChild(state.content);
			state.content.destroy({ children: true });
			resources.releaseRetired();
			state.content = content;
			application.stage.addChild(content);

			return content;
		};

		const nextRequestId = function nextRequestId(): number {
			state.requestId += 1;

			return state.requestId;
		};

		const renderBuiltScene = async function renderBuiltScene(
			requestId: number,
			project: Project,
			assets: ProjectAssetBlobs,
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

			const content = replaceContent();
			renderSceneToContainer(content, scene.value, prepared.value);
			application.render();

			return rendererSuccess(undefined);
		};

		const renderSetup = async function renderSetup(
			project: Project,
			assets: ProjectAssetBlobs,
			options: FixedCanvasRenderOptions = {}
		): Promise<RendererResult<void>> {
			const requestId = nextRequestId();

			return renderBuiltScene(requestId, project, assets, () => createSetupRenderScene(project, options));
		};

		const renderPose = async function renderPose(
			project: Project,
			pose: EvaluatedPose,
			assets: ProjectAssetBlobs,
			options: FixedCanvasRenderOptions = {}
		): Promise<RendererResult<void>> {
			const requestId = nextRequestId();

			return renderBuiltScene(requestId, project, assets, () => createPoseRenderScene(project, pose, options));
		};

		const destroy = function destroy(): void {
			if (state.destroyed) {
				return;
			}

			state.destroyed = true;
			state.requestId += 1;
			resources.destroy();
			application.destroy(true, true);
		};

		return rendererSuccess({
			canvas,
			renderSetup,
			renderPose,
			capturePng: () => captureCanvasPng(canvas),
			destroy
		});
	} catch (error: unknown) {
		return rendererFailure('renderer-failure', error instanceof Error ? error.message : 'Pixi renderer initialization failed.');
	}
};
