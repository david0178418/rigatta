import { zipSync } from 'fflate';

// fflate reads the DOS timestamp through local Date getters. Construct the
// epoch in local calendar time so every timezone remains within ZIP's range.
const ZIP_EPOCH = new Date(1980, 0, 1);

export type ExportFile = Readonly<{
	path: string;
	bytes: Uint8Array;
}>;

export type ExportPackageResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: string }>;

const success = function success<TValue>(value: TValue): ExportPackageResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(error: string): ExportPackageResult<never> {
	return { ok: false, error };
};

const comparePaths = function comparePaths(left: string, right: string): number {
	return left === right ? 0 : left < right ? -1 : 1;
};

export const sortExportFiles = function sortExportFiles(
	files: readonly ExportFile[]
): readonly ExportFile[] {
	return [...files].sort((left, right) => comparePaths(left.path, right.path));
};

export const safeExportPathSegment = function safeExportPathSegment(
	value: string,
	fallback: string = 'export'
): string {
	const normalized = value.trim()
		.replace(/[^a-z0-9_-]+/gi, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80);

	return normalized.length > 0 ? normalized : fallback;
};

export const safeExportFilenameFor = function safeExportFilenameFor(
	projectName: string
): string {
	return `${safeExportPathSegment(projectName, 'project')}.zip`;
};

const validExportPath = function validExportPath(path: string): boolean {
	const segments = path.split('/');

	return path.trim().length > 0
		&& !path.startsWith('/')
		&& !path.includes('\\')
		&& segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
};

export const createExportZip = function createExportZip(
	files: readonly ExportFile[]
): ExportPackageResult<Uint8Array> {
	if (files.length === 0) {
		return failure('Export ZIPs must contain at least one file.');
	}
	if (files.some((file) => !validExportPath(file.path))) {
		return failure('Export file paths must be relative and normalized.');
	}
	if (new Set(files.map((file) => file.path)).size !== files.length) {
		return failure('Export file paths must be unique.');
	}

	const sortedFiles = sortExportFiles(files);
	const entries = Object.fromEntries(sortedFiles.map((file) => [file.path, file.bytes]));

	return success(zipSync(entries, { level: 6, mtime: ZIP_EPOCH }));
};

const createZipBlobFromBytes = function createZipBlobFromBytes(
	bytes: Uint8Array
): ExportPackageResult<Blob> {
	if (typeof globalThis.Blob === 'undefined') {
		return failure('This browser cannot create an export ZIP Blob.');
	}

	try {
		const buffer = new ArrayBuffer(bytes.byteLength);
		new Uint8Array(buffer).set(bytes);

		return success(new Blob([buffer], { type: 'application/zip' }));
	} catch (error: unknown) {
		return failure(error instanceof Error ? error.message : 'The export ZIP Blob could not be created.');
	}
};

export const createExportZipBlobFromBytes = function createExportZipBlobFromBytes(
	bytes: Uint8Array
): ExportPackageResult<Blob> {
	return createZipBlobFromBytes(bytes);
};

export const createExportZipBlob = function createExportZipBlob(
	files: readonly ExportFile[]
): ExportPackageResult<Blob> {
	const archive = createExportZip(files);

	if (!archive.ok) {
		return archive;
	}

	return createZipBlobFromBytes(archive.value);
};
