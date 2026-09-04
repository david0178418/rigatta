import { exportError, exportFailure, exportSuccess, type ExportResult } from './errors.ts';

export type ExportDownloadAnchor = {
	href: string;
	download: string;
	click: () => void;
};

export type ExportDownloadEnvironment = Readonly<{
	createObjectURL: (blob: Blob) => string;
	revokeObjectURL: (url: string) => void;
	createAnchor: () => ExportDownloadAnchor;
}>;

const browserDownloadEnvironment = function browserDownloadEnvironment(): ExportDownloadEnvironment | undefined {
	if (typeof document === 'undefined' || typeof globalThis.URL === 'undefined') {
		return undefined;
	}

	return {
		createObjectURL: (blob) => globalThis.URL.createObjectURL(blob),
		revokeObjectURL: (url) => globalThis.URL.revokeObjectURL(url),
		createAnchor: () => document.createElement('a')
	};
};

const failureFor = function failureFor(message: string): ExportResult<never> {
	return exportFailure(exportError('download-failure', 'packaging', message));
};

export const downloadExportZip = function downloadExportZip(
	blob: Blob,
	filename: string,
	environment: ExportDownloadEnvironment | undefined = browserDownloadEnvironment()
): ExportResult<void> {
	if (!environment) {
		return failureFor('This browser cannot download an export ZIP.');
	}

	try {
		const url = environment.createObjectURL(blob);
		const downloadResult: ExportResult<void> = ((): ExportResult<void> => {
			try {
				const anchor = environment.createAnchor();

				anchor.href = url;
				anchor.download = filename;
				anchor.click();

				return exportSuccess(undefined);
			} catch (error: unknown) {
				return failureFor(error instanceof Error ? error.message : 'The export ZIP could not be downloaded.');
			}
		})();

		try {
			environment.revokeObjectURL(url);
		} catch (error: unknown) {
			return failureFor(error instanceof Error ? `The export download URL could not be released: ${error.message}` : 'The export download URL could not be released.');
		}

		return downloadResult;
	} catch (error: unknown) {
		return failureFor(error instanceof Error ? error.message : 'The export ZIP could not be downloaded.');
	}
};
