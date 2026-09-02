import {
	decodeImageBlob,
	mimeTypeFromFileName,
	validateImageBytes,
	type ImageValidationResult,
	type ValidatedImage
} from './images.ts';
import { isSupportedImageMimeType, type SupportedImageMimeType } from '../domain/schema.ts';

export type ImportedImage = ValidatedImage & Readonly<{
	name: string;
	relativePath: string;
}>;

export type AssetImportSkip = Readonly<{
	relativePath: string;
	reason: string;
}>;

export type AssetImportResult<TValue = readonly ImportedImage[]> =
	| Readonly<{ ok: true; value: TValue; skipped?: readonly AssetImportSkip[] }>
	| Readonly<{ ok: false; error: string }>;

type DirectoryEntry = FileSystemHandle & Readonly<{
	getFile?: () => Promise<File>;
	values?: () => AsyncIterable<DirectoryEntry>;
}>;

export type DirectoryHandle = FileSystemHandle & Readonly<{
	kind: 'directory';
	values: () => AsyncIterable<DirectoryEntry>;
}>;

export type AssetDropItem = Readonly<{
	getAsFile: () => File | null;
	getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
}>;

const isDirectoryHandle = function isDirectoryHandle(
	handle: FileSystemHandle | null
): handle is DirectoryHandle {
	if (!handle || handle.kind !== 'directory' || !('values' in handle)) {
		return false;
	}

	return typeof handle.values === 'function';
};

const normalizeRelativePath = function normalizeRelativePath(path: string): string | undefined {
	const normalizedPath = path.replaceAll('\\', '/');
	const segments = normalizedPath.split('/');

	if (normalizedPath.startsWith('/') || segments.some((segment) => segment === '..')) {
		return undefined;
	}

	const safeSegments = segments.filter((segment) => segment.length > 0 && segment !== '.');

	return safeSegments.length > 0 ? safeSegments.join('/') : undefined;
};

const fileNameFromPath = function fileNameFromPath(path: string): string {
	return path.split('/').at(-1) ?? path;
};

const mimeTypeForFile = function mimeTypeForFile(
	file: File,
	relativePath: string
): SupportedImageMimeType | undefined {
	return isSupportedImageMimeType(file.type) ? file.type : mimeTypeFromFileName(relativePath);
};

const invalidImage = function invalidImage(error: string): AssetImportResult<never> {
	return { ok: false, error };
};

const validateImportedFile = async function validateImportedFile(
	file: File,
	relativePath: string
): Promise<AssetImportResult<ImportedImage>> {
	const mimeType = mimeTypeForFile(file, relativePath);

	if (!mimeType) {
		return invalidImage(`Unsupported image file: ${relativePath}`);
	}

	const bytes = new Uint8Array(await file.arrayBuffer());
	const validated = validateImageBytes(bytes, mimeType);

	if (!validated.ok) {
		return invalidImage(`${relativePath}: ${validated.error}`);
	}

	return {
		ok: true,
		value: {
			...validated.value,
			name: fileNameFromPath(relativePath),
			relativePath
		}
	};
};

const collectDirectoryFiles = async function collectDirectoryFiles(
	directory: DirectoryHandle,
	prefix: string = ''
): Promise<readonly Readonly<{ file: File; relativePath: string }>[]> {
	const entries = await Array.fromAsync(directory.values());
	const nestedFiles = await Promise.all(entries.map(async (entry) => {
		const path = `${prefix}${entry.name}`;

		if (entry.kind === 'file' && entry.getFile) {
			return [{ file: await entry.getFile(), relativePath: path }];
		}
		if (entry.kind !== 'directory' || !entry.values) {
			return [];
		}
		const nestedDirectory: DirectoryHandle = {
			kind: 'directory',
			name: entry.name,
			isSameEntry: entry.isSameEntry,
			values: entry.values
		};

		return collectDirectoryFiles(nestedDirectory, `${path}/`);
	}));

	return nestedFiles.flat();
};

const normalizeFiles = function normalizeFiles(
	files: readonly Readonly<{ file: File; relativePath: string }>[]
): AssetImportResult<readonly Readonly<{ file: File; relativePath: string }>[]> {
	const normalized = files.flatMap((entry) => {
		const relativePath = normalizeRelativePath(entry.relativePath);

		return relativePath ? [{ file: entry.file, relativePath }] : [];
	});
	const duplicatePaths = normalized.some((entry, index) => normalized.findIndex((candidate) => candidate.relativePath === entry.relativePath) !== index);

	if (normalized.length !== files.length) {
		return invalidImage('An imported path is empty or unsafe.');
	}
	if (duplicatePaths) {
		return invalidImage('The import contains duplicate relative paths.');
	}

	return { ok: true, value: normalized };
};

const importFiles = async function importFiles(
	files: readonly Readonly<{ file: File; relativePath: string }>[]
): Promise<AssetImportResult> {
	const normalized = normalizeFiles(files);

	if (!normalized.ok) {
		return normalized;
	}

	const unsupported = normalized.value.flatMap((entry) => mimeTypeForFile(entry.file, entry.relativePath)
		? []
		: [{ relativePath: entry.relativePath, reason: 'Unsupported image type.' }]);
	const imageCandidates = normalized.value.filter((entry) => mimeTypeForFile(entry.file, entry.relativePath) !== undefined);
	const results = await Promise.all(imageCandidates.map(async (entry) => ({
		entry,
		result: await validateImportedFile(entry.file, entry.relativePath)
	})));
	const skipped = [
		...unsupported,
		...results.flatMap(({ entry, result }) => result.ok
			? []
			: [{ relativePath: entry.relativePath, reason: result.error }])
	];

	return {
		ok: true,
		value: results.flatMap(({ result }) => result.ok ? [result.value] : []),
		...(skipped.length > 0 ? { skipped } : {})
	};
};

export const importDirectoryHandle = async function importDirectoryHandle(
	directory: DirectoryHandle
): Promise<AssetImportResult> {
	try {
		return importFiles(await collectDirectoryFiles(directory));
	} catch (error: unknown) {
		return invalidImage(error instanceof Error ? `Directory traversal failed: ${error.message}` : 'Directory traversal failed.');
	}
};

export const pickImageDirectory = async function pickImageDirectory(): Promise<AssetImportResult> {
	if (!window.showDirectoryPicker) {
		return invalidImage('This browser does not support directory picking.');
	}

	try {
		const directory = await window.showDirectoryPicker({ mode: 'read' });
		return importDirectoryHandle(directory);
	} catch (error: unknown) {
		return invalidImage(error instanceof DOMException && error.name === 'AbortError'
			? 'Directory selection was cancelled.'
			: error instanceof Error ? `Directory selection failed: ${error.message}` : 'Directory selection failed.');
	}
};

export const importDroppedItems = async function importDroppedItems(
	items: readonly AssetDropItem[]
): Promise<AssetImportResult> {
	const itemResults = await Promise.all(items.map(async (item) => {
		const handle = item.getAsFileSystemHandle ? await item.getAsFileSystemHandle() : null;

		if (isDirectoryHandle(handle)) {
			return importDirectoryHandle(handle);
		}

		const file = item.getAsFile();

		return file ? importFiles([{ file, relativePath: file.name }]) : invalidImage('Dropped item is not a file or directory.');
	}));
	const failed = itemResults.find((result) => !result.ok);

	if (failed && !failed.ok) {
		return failed;
	}

	const imported = itemResults.flatMap((result) => result.ok ? result.value : []);
	const skipped = itemResults.flatMap((result) => result.ok ? result.skipped ?? [] : []);
	const paths = imported.map((image) => image.relativePath);

	if (new Set(paths).size !== paths.length) {
		return invalidImage('The import contains duplicate relative paths.');
	}

	return {
		ok: true,
		value: imported,
		...(skipped.length > 0 ? { skipped } : {})
	};
};

export const decodeImportedImage = async function decodeImportedImage(
	image: ImportedImage
): Promise<ImageValidationResult> {
	const imageBuffer = new ArrayBuffer(image.bytes.byteLength);
	new Uint8Array(imageBuffer).set(image.bytes);

	return decodeImageBlob(new Blob([imageBuffer], { type: image.mimeType }), image.mimeType);
};
