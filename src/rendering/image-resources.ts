import { Texture } from 'pixi.js';
import type { EntityId } from '../domain/ids.ts';
import type { ImageAsset, Project } from '../domain/model.ts';
import { decodeImageBlob } from '../assets/images.ts';
import type { ProjectAssetBlobs } from '../persistence/repository.ts';
import type { ImageRenderInstance } from './pose-images.ts';
import { rendererFailure, rendererSuccess, type RendererResult } from './renderer-types.ts';

export type PreparedImage = Readonly<{
	instance: ImageRenderInstance;
	bitmap: ImageBitmap;
	texture: Texture;
}>;

type ImageResource = Readonly<{
	assetId: EntityId;
	blob: Blob;
	mimeType: ImageAsset['mimeType'];
	bitmap: ImageBitmap;
	texture: Texture;
}>;

type PendingImageResource = Readonly<{
	blob: Blob;
	mimeType: ImageAsset['mimeType'];
	token: symbol;
	promise: Promise<RendererResult<ImageResource>>;
}>;

type ResourceState = {
	cache: Map<EntityId, ImageResource>;
	retired: readonly ImageResource[];
	pending: Map<EntityId, PendingImageResource>;
	destroyed: boolean;
};

export type ImageResourceStore = Readonly<{
	prepare: (
		project: Project,
		assets: ProjectAssetBlobs,
		instances: readonly ImageRenderInstance[]
	) => Promise<RendererResult<readonly PreparedImage[]>>;
	releaseRetired: () => void;
	destroy: () => void;
}>;

const disposeImageResource = function disposeImageResource(resource: ImageResource): void {
	resource.texture.destroy(true);
	resource.bitmap.close();
};

const imageFailure = function imageFailure(
	asset: ImageAsset,
	error: string
): RendererResult<never> {
	return rendererFailure('invalid-asset', `${asset.relativePath}: ${error}`);
};

const resourceForAsset = async function resourceForAsset(
	state: ResourceState,
	asset: ImageAsset,
	blob: Blob
): Promise<RendererResult<ImageResource>> {
	if (state.destroyed) {
		return rendererFailure('renderer-failure', 'The canvas renderer has been destroyed.');
	}

	const cached = state.cache.get(asset.id);

	if (cached?.blob === blob && cached.mimeType === asset.mimeType) {
		return rendererSuccess(cached);
	}

	const pending = state.pending.get(asset.id);

	if (pending?.blob === blob && pending.mimeType === asset.mimeType) {
		return pending.promise;
	}

	const token = Symbol(asset.id);
	const promise = decodeImageBlob(blob, asset.mimeType).then((decoded): RendererResult<ImageResource> => {
		const currentPending = state.pending.get(asset.id);

		if (currentPending?.token !== token) {
			if (decoded.ok) {
				decoded.value.bitmap.close();
			}

			return rendererFailure('renderer-failure', 'Image resource loading was superseded.');
		}

		state.pending.delete(asset.id);

		if (!decoded.ok) {
			return imageFailure(asset, decoded.error);
		}
		if (state.destroyed) {
			decoded.value.bitmap.close();
			return rendererFailure('renderer-failure', 'The canvas renderer has been destroyed.');
		}

		try {
			const resource = {
				assetId: asset.id,
				blob,
				mimeType: asset.mimeType,
				bitmap: decoded.value.bitmap,
				texture: Texture.from(decoded.value.bitmap)
			};
			const previous = state.cache.get(asset.id);

			if (previous && previous !== resource) {
				state.retired = [...state.retired, previous];
			}

			state.cache.set(asset.id, resource);

			return rendererSuccess(resource);
		} catch (error: unknown) {
			decoded.value.bitmap.close();

			return rendererFailure(
				'renderer-failure',
				error instanceof Error ? error.message : 'Image texture creation failed.'
			);
		}
	});

	state.pending.set(asset.id, { blob, mimeType: asset.mimeType, token, promise });

	return promise;
};

const resourceForInstance = async function resourceForInstance(
	state: ResourceState,
	project: Project,
	assets: ProjectAssetBlobs,
	instance: ImageRenderInstance
): Promise<RendererResult<ImageResource>> {
	const asset = project.assets.find((candidate) => candidate.id === instance.attachment.assetId);

	if (!asset) {
		return rendererFailure('invalid-asset', `Image asset for attachment ${instance.attachment.id} is unavailable.`);
	}

	const blob = assets.get(asset.id);

	return blob ? resourceForAsset(state, asset, blob) : rendererFailure(
		'invalid-asset',
		`Image asset for attachment ${instance.attachment.id} is unavailable.`
	);
};

export const createImageResourceStore = function createImageResourceStore(): ImageResourceStore {
	const state: ResourceState = {
		cache: new Map(),
		retired: [],
		pending: new Map(),
		destroyed: false
	};

	const prepare = async function prepare(
		project: Project,
		assets: ProjectAssetBlobs,
		instances: readonly ImageRenderInstance[]
	): Promise<RendererResult<readonly PreparedImage[]>> {
		if (state.destroyed) {
			return rendererFailure('renderer-failure', 'The canvas renderer has been destroyed.');
		}

		const resources = await Promise.all(instances.map(async (instance) => ({
			instance,
			result: await resourceForInstance(state, project, assets, instance)
		})));
		const failed = resources.map(({ result }) => result).find((result) => !result.ok);

		if (state.destroyed) {
			return rendererFailure('renderer-failure', 'The canvas renderer has been destroyed.');
		}
		if (failed && !failed.ok) {
			return failed;
		}

		return rendererSuccess(resources.flatMap(({ instance, result }) => result.ok
			? [{
					instance,
					bitmap: result.value.bitmap,
					texture: result.value.texture
				}]
			: []));
	};

	const releaseRetired = function releaseRetired(): void {
		state.retired.forEach(disposeImageResource);
		state.retired = [];
	};

	const destroy = function destroy(): void {
		if (state.destroyed) {
			return;
		}

		state.destroyed = true;
		state.pending.clear();
		state.cache.forEach(disposeImageResource);
		state.retired.forEach(disposeImageResource);
		state.cache.clear();
		state.retired = [];
	};

	return { prepare, releaseRetired, destroy };
};
