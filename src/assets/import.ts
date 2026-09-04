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

export type AssetImportEntry =
	| Readonly<{ kind: 'imported'; image: ImportedImage }>
	| Readonly<{ kind: 'skipped'; relativePath: string; reason: string }>
	| Readonly<{ kind: 'invalid'; relativePath: string; reason: string }>
	| Readonly<{ kind: 'unsupported'; relativePath: string; reason: string }>;

export type AssetImportEntriesResult = Readonly<{
	entries: readonly AssetImportEntry[];
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
	relativePath?: string;
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

const skippedEntry = function skippedEntry(
	relativePath: string,
	reason: string
): AssetImportEntry {
	return { kind: 'skipped', relativePath, reason };
};

const invalidEntry = function invalidEntry(
	relativePath: string,
	reason: string
): AssetImportEntry {
	return { kind: 'invalid', relativePath, reason };
};

const unsupportedEntry = function unsupportedEntry(
	relativePath: string,
	reason: string
): AssetImportEntry {
	return { kind: 'unsupported', relativePath, reason };
};

const normalizedPathForEntry = function normalizedPathForEntry(relativePath: string): string {
	return normalizeRelativePath(relativePath) ?? relativePath;
};

const duplicatePathsFor = function duplicatePathsFor(
	paths: readonly string[]
): ReadonlySet<string> {
	return new Set(paths.filter((path, index) => paths.indexOf(path) !== index));
};

const importFileEntry = async function importFileEntry(
	entry: Readonly<{ file: File; relativePath: string }>,
	duplicatePaths: ReadonlySet<string>
): Promise<AssetImportEntry> {
	const normalizedPath = normalizeRelativePath(entry.relativePath);

	if (!normalizedPath) {
		return invalidEntry(entry.relativePath, 'The imported path is empty or unsafe.');
	}
	if (duplicatePaths.has(normalizedPath)) {
		return invalidEntry(normalizedPath, 'The import contains a duplicate relative path.');
	}

	const mimeType = mimeTypeForFile(entry.file, normalizedPath);

	if (!mimeType) {
		return unsupportedEntry(normalizedPath, 'Unsupported image type.');
	}

	try {
		const result = await validateImportedFile(entry.file, normalizedPath);

		return result.ok
			? { kind: 'imported', image: result.value }
			: invalidEntry(normalizedPath, result.error);
	} catch (error: unknown) {
		return skippedEntry(
			normalizedPath,
			error instanceof Error ? `File read failed: ${error.message}` : 'File read failed.'
		);
	}
};

const importFileEntries = async function importFileEntries(
	files: readonly Readonly<{ file: File; relativePath: string }>[],
	duplicatePaths: ReadonlySet<string> = duplicatePathsFor(files.map((entry) => normalizedPathForEntry(entry.relativePath)))
): Promise<readonly AssetImportEntry[]> {
	return Promise.all(files.map((entry) => importFileEntry(entry, duplicatePaths)));
};

type CollectedDropItem =
	| Readonly<{ kind: 'files'; files: readonly Readonly<{ file: File; relativePath: string }>[] }>
	| Readonly<{ kind: 'issue'; issue: AssetImportEntry }>;

type FileSystemHandleResult =
	| Readonly<{ ok: true; value: FileSystemHandle | null }>
	| Readonly<{ ok: false; error: unknown }>;

const fileSystemHandleResultFor = async function fileSystemHandleResultFor(
	item: AssetDropItem
): Promise<FileSystemHandleResult> {
	try {
		return {
			ok: true,
			value: item.getAsFileSystemHandle ? await item.getAsFileSystemHandle() : null
		};
	} catch (error: unknown) {
		return { ok: false, error };
	}
};

const collectedDropItemFor = async function collectedDropItemFor(
	item: AssetDropItem
): Promise<CollectedDropItem> {
	const handleResult = await fileSystemHandleResultFor(item);

	if (!handleResult.ok) {
		return {
			kind: 'issue',
			issue: skippedEntry(
				item.relativePath ?? 'Dropped item',
				handleResult.error instanceof Error
					? `Drop handle read failed: ${handleResult.error.message}`
					: 'Drop handle read failed.'
			)
		};
	}

	const handle = handleResult.value;

	if (isDirectoryHandle(handle)) {
		try {
			return { kind: 'files', files: await collectDirectoryFiles(handle) };
		} catch (error: unknown) {
			return {
				kind: 'issue',
				issue: skippedEntry(
					handle.name,
					error instanceof Error ? `Directory traversal failed: ${error.message}` : 'Directory traversal failed.'
				)
			};
		}
	}

	const file = item.getAsFile();

	return file
		? { kind: 'files', files: [{ file, relativePath: item.relativePath ?? file.name }] }
		: {
				kind: 'issue',
				issue: skippedEntry(item.relativePath ?? 'Dropped item', 'Dropped item is not a file or directory.')
			};
};

export const importDroppedEntries = async function importDroppedEntries(
	items: readonly AssetDropItem[]
): Promise<AssetImportEntriesResult> {
	const collected = await Promise.all(items.map(collectedDropItemFor));
	const files = collected.flatMap((item) => item.kind === 'files' ? item.files : []);
	const duplicatePaths = duplicatePathsFor(files.map((entry) => normalizedPathForEntry(entry.relativePath)));
	const entries = await Promise.all(collected.map((item) => item.kind === 'issue'
		? Promise.resolve([item.issue])
		: importFileEntries(item.files, duplicatePaths)));

	return { entries: entries.flat() };
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
