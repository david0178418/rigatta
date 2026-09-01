import { zipSync } from 'fflate';

const ZIP_EPOCH = new Date(Date.UTC(1980, 0, 1));

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

	const sortedFiles = [...files].sort((left, right) => comparePaths(left.path, right.path));
	const entries = Object.fromEntries(sortedFiles.map((file) => [file.path, file.bytes]));

	return success(zipSync(entries, { level: 6, mtime: ZIP_EPOCH }));
};

export const createExportZipBlob = function createExportZipBlob(
	files: readonly ExportFile[]
): ExportPackageResult<Blob> {
	const archive = createExportZip(files);

	if (!archive.ok) {
		return archive;
	}

	const buffer = new ArrayBuffer(archive.value.byteLength);
	new Uint8Array(buffer).set(archive.value);

	return success(new Blob([buffer], { type: 'application/zip' }));
};
