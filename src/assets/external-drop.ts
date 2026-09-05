import { parseEntityId, type EntityId } from '../domain/ids.ts';
import { isSupportedImageMimeType, type SupportedImageMimeType } from '../domain/schema.ts';
import { mimeTypeFromFileName } from './images.ts';
import type { DirectoryHandle } from './import.ts';

export const INTERNAL_ASSET_DRAG_MIME = 'application/x-rigatta-asset';

export type CurrentDropSource =
	| 'os-single-file'
	| 'os-multiple-files'
	| 'os-folder'
	| 'internal-asset-row'
	| 'internal-slot-row'
	| 'internal-bone-row';

export type CurrentDropTarget =
	| 'assets-panel'
	| 'canvas-pasteboard'
	| 'canvas-bounds'
	| 'slot-row'
	| 'viewport-controls'
	| 'bone-row'
	| 'draw-order-row';

export type CurrentDropBehavior =
	| 'asset-import'
	| 'internal-asset-placement'
	| 'internal-slot-assignment'
	| 'slot-reorder'
	| 'bone-reparent'
	| 'no-op'
	| 'excluded'
	| 'rejected';

export type CurrentDropSurfaceCharacterization = Readonly<{
	source: CurrentDropSource;
	target: CurrentDropTarget;
	behavior: CurrentDropBehavior;
}>;

export const CURRENT_DROP_SURFACE_CHARACTERIZATION = [
	{ source: 'os-single-file', target: 'assets-panel', behavior: 'asset-import' },
	{ source: 'os-multiple-files', target: 'assets-panel', behavior: 'asset-import' },
	{ source: 'os-folder', target: 'assets-panel', behavior: 'asset-import' },
	{ source: 'os-single-file', target: 'canvas-pasteboard', behavior: 'no-op' },
	{ source: 'os-multiple-files', target: 'canvas-pasteboard', behavior: 'no-op' },
	{ source: 'os-folder', target: 'canvas-pasteboard', behavior: 'no-op' },
	{ source: 'os-single-file', target: 'canvas-bounds', behavior: 'no-op' },
	{ source: 'os-multiple-files', target: 'canvas-bounds', behavior: 'no-op' },
	{ source: 'os-folder', target: 'canvas-bounds', behavior: 'no-op' },
	{ source: 'os-single-file', target: 'slot-row', behavior: 'rejected' },
	{ source: 'os-multiple-files', target: 'slot-row', behavior: 'rejected' },
	{ source: 'os-folder', target: 'slot-row', behavior: 'rejected' },
	{ source: 'os-single-file', target: 'viewport-controls', behavior: 'excluded' },
	{ source: 'os-multiple-files', target: 'viewport-controls', behavior: 'excluded' },
	{ source: 'os-folder', target: 'viewport-controls', behavior: 'excluded' },
	{ source: 'internal-asset-row', target: 'assets-panel', behavior: 'rejected' },
	{ source: 'internal-asset-row', target: 'canvas-pasteboard', behavior: 'internal-asset-placement' },
	{ source: 'internal-asset-row', target: 'canvas-bounds', behavior: 'internal-asset-placement' },
	{ source: 'internal-asset-row', target: 'slot-row', behavior: 'internal-slot-assignment' },
	{ source: 'internal-asset-row', target: 'viewport-controls', behavior: 'excluded' },
	{ source: 'internal-slot-row', target: 'slot-row', behavior: 'slot-reorder' },
	{ source: 'internal-slot-row', target: 'draw-order-row', behavior: 'slot-reorder' },
	{ source: 'internal-slot-row', target: 'canvas-pasteboard', behavior: 'no-op' },
	{ source: 'internal-slot-row', target: 'canvas-bounds', behavior: 'no-op' },
	{ source: 'internal-bone-row', target: 'bone-row', behavior: 'bone-reparent' },
	{ source: 'internal-bone-row', target: 'canvas-pasteboard', behavior: 'no-op' },
	{ source: 'internal-bone-row', target: 'canvas-bounds', behavior: 'no-op' }
] as const satisfies readonly CurrentDropSurfaceCharacterization[];

export type DataTransferItemLike = Readonly<{
	kind: DataTransferItem['kind'];
	type: string;
	getAsFile: () => File | null;
	getAsString?: (callback: (data: string) => void) => void;
	getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
}>;

export type ExternalDropFile = Readonly<{
	kind: 'external-file';
	file: File;
	name: string;
	relativePath: string;
	mimeType: string;
	supportedMimeType: SupportedImageMimeType | undefined;
}>;

export type ExternalDropDirectory = Readonly<{
	kind: 'external-directory';
	name: string;
	directory: DirectoryHandle;
}>;

export type ExternalDropUnsupportedItem = Readonly<{
	kind: 'unsupported-item';
	name: string;
	type: string;
	reason: string;
}>;

export type ExternalDropItem =
	| Readonly<{ kind: 'internal-asset'; assetId: EntityId }>
	| ExternalDropFile
	| ExternalDropDirectory
	| ExternalDropUnsupportedItem;

export type ExternalDropRoute =
	| Readonly<{ kind: 'internal-placement'; assetId: EntityId }>
	| Readonly<{ kind: 'single-external-import-and-place'; file: ExternalDropFile }>
	| Readonly<{
		kind: 'bulk-external-import';
		files: readonly ExternalDropFile[];
		directories: readonly ExternalDropDirectory[];
		unsupported: readonly ExternalDropUnsupportedItem[];
	}>
	| Readonly<{
		kind: 'unsupported';
		items: readonly ExternalDropItem[];
		reason: string;
	}>
	| Readonly<{ kind: 'empty' }>;

const isDirectoryHandle = function isDirectoryHandle(
	handle: FileSystemHandle | null
): handle is DirectoryHandle {
	if (!handle || handle.kind !== 'directory' || !('values' in handle)) {
		return false;
	}

	return typeof handle.values === 'function';
};

const directoryFor = async function directoryFor(
	item: DataTransferItemLike
): Promise<DirectoryHandle | undefined> {
	if (!item.getAsFileSystemHandle) {
		return undefined;
	}

	try {
		const handle = await item.getAsFileSystemHandle();

		return isDirectoryHandle(handle) ? handle : undefined;
	} catch {
		return undefined;
	}
};

const internalAssetIdFor = async function internalAssetIdFor(
	item: DataTransferItemLike
): Promise<EntityId | undefined> {
	if (item.kind !== 'string' || item.type !== INTERNAL_ASSET_DRAG_MIME || !item.getAsString) {
		return undefined;
	}

	try {
		const value = await new Promise<string>((resolve) => {
			const getAsString = item.getAsString;
			if (!getAsString) {
				resolve('');
				return;
			}

			getAsString(resolve);
		});

		return parseEntityId(value);
	} catch {
		return undefined;
	}
};

const relativePathFor = function relativePathFor(file: File): string {
	const webkitRelativePath = file.webkitRelativePath;

	return typeof webkitRelativePath === 'string' && webkitRelativePath.length > 0
		? webkitRelativePath
		: file.name;
};

const supportedMimeTypeFor = function supportedMimeTypeFor(
	file: File,
	relativePath: string
): SupportedImageMimeType | undefined {
	return isSupportedImageMimeType(file.type) ? file.type : mimeTypeFromFileName(relativePath);
};

const externalFileFor = function externalFileFor(file: File): ExternalDropFile {
	const relativePath = relativePathFor(file);

	return {
		kind: 'external-file',
		file,
		name: file.name,
		relativePath,
		mimeType: file.type,
		supportedMimeType: supportedMimeTypeFor(file, relativePath)
	};
};

const unsupportedItemFor = function unsupportedItemFor(
	item: DataTransferItemLike,
	name: string,
	reason: string
): ExternalDropUnsupportedItem {
	return {
		kind: 'unsupported-item',
		name,
		type: item.type,
		reason
	};
};

const adaptedItemFor = async function adaptedItemFor(
	item: DataTransferItemLike
): Promise<ExternalDropItem | undefined> {
	const internalAssetId = await internalAssetIdFor(item);

	if (item.kind === 'string' && item.type === INTERNAL_ASSET_DRAG_MIME) {
		return internalAssetId
			? { kind: 'internal-asset', assetId: internalAssetId }
			: unsupportedItemFor(item, 'Internal asset', 'The internal asset identifier is missing or invalid.');
	}

	const directory = await directoryFor(item);

	if (directory) {
		return { kind: 'external-directory', name: directory.name, directory };
	}

	const file = item.getAsFile();

	if (file) {
		return externalFileFor(file);
	}
	if (item.kind === 'file') {
		return unsupportedItemFor(item, 'Dropped file', 'The browser did not expose the dropped file.');
	}

	return item.type.length > 0
		? unsupportedItemFor(item, 'Dropped item', 'The dropped item is not an image file or directory.')
		: undefined;
};

export const adaptDataTransferItems = async function adaptDataTransferItems(
	items: readonly DataTransferItemLike[]
): Promise<readonly ExternalDropItem[]> {
	const adapted = await Promise.all(items.map(adaptedItemFor));

	return adapted.flatMap((item) => item ? [item] : []);
};

const isInternalAsset = function isInternalAsset(
	item: ExternalDropItem
): item is Extract<ExternalDropItem, { kind: 'internal-asset' }> {
	return item.kind === 'internal-asset';
};

const isExternalFile = function isExternalFile(
	item: ExternalDropItem
): item is ExternalDropFile {
	return item.kind === 'external-file';
};

const isExternalDirectory = function isExternalDirectory(
	item: ExternalDropItem
): item is ExternalDropDirectory {
	return item.kind === 'external-directory';
};

const isUnsupportedItem = function isUnsupportedItem(
	item: ExternalDropItem
): item is ExternalDropUnsupportedItem {
	return item.kind === 'unsupported-item';
};

export const classifyExternalDrop = function classifyExternalDrop(
	items: readonly ExternalDropItem[]
): ExternalDropRoute {
	if (items.length === 0) {
		return { kind: 'empty' };
	}

	const internalAssets = items.filter(isInternalAsset);
	const files = items.filter(isExternalFile);
	const directories = items.filter(isExternalDirectory);
	const unsupported = items.filter(isUnsupportedItem);

	if (internalAssets.length > 0) {
		return internalAssets.length === 1
			&& files.length === 0
			&& directories.length === 0
			&& unsupported.length === 0
			? { kind: 'internal-placement', assetId: internalAssets[0].assetId }
			: {
					kind: 'unsupported',
					items,
					reason: 'Internal asset drops cannot be combined with other drop sources.'
				};
	}

	const sourceCount = files.length + directories.length + unsupported.length;

	if (directories.length > 0 || sourceCount > 1) {
		return { kind: 'bulk-external-import', files, directories, unsupported };
	}

	const file = files.at(0);

	if (file) {
		return file.supportedMimeType
			? { kind: 'single-external-import-and-place', file }
			: { kind: 'unsupported', items, reason: 'The dropped file is not a supported image.' };
	}
	if (unsupported.length > 0) {
		return { kind: 'unsupported', items, reason: unsupported[0].reason };
	}

	return { kind: 'empty' };
};
