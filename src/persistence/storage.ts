export type StorageAdapter = Readonly<{
	estimate?: () => Promise<StorageEstimate>;
	persist?: () => Promise<boolean>;
}>;

export type StorageError = Readonly<{
	code: 'unsupported-browser' | 'storage-failure';
	message: string;
}>;

export type StorageResult<TValue> =
	| Readonly<{ ok: true; value: TValue }>
	| Readonly<{ ok: false; error: StorageError }>;

export type StorageReport = Readonly<{
	usageBytes: number;
	quotaBytes: number;
	availableBytes: number;
	usageRatio: number | null;
}>;

const success = function success<TValue>(value: TValue): StorageResult<TValue> {
	return { ok: true, value };
};

const failure = function failure(
	code: StorageError['code'],
	message: string
): StorageResult<never> {
	return { ok: false, error: { code, message } };
};

const browserStorage = function browserStorage(): StorageAdapter | undefined {
	return typeof globalThis.navigator === 'undefined' ? undefined : globalThis.navigator.storage;
};

const storageFailure = function storageFailure(action: string, error: unknown): StorageResult<never> {
	return failure(
		'storage-failure',
		`${action}: ${error instanceof Error ? error.message : 'Unknown storage failure.'}`
	);
};

const nonNegativeFinite = function nonNegativeFinite(value: number | undefined): number {
	return value !== undefined && Number.isFinite(value) && value >= 0 ? value : 0;
};

export const requestPersistentStorage = async function requestPersistentStorage(
	storage: StorageAdapter | undefined = browserStorage()
): Promise<StorageResult<boolean>> {
	if (!storage?.persist) {
		return success(false);
	}

	try {
		return success(await storage.persist());
	} catch (error: unknown) {
		return storageFailure('Could not request persistent storage', error);
	}
};

export const estimateStorage = async function estimateStorage(
	storage: StorageAdapter | undefined = browserStorage()
): Promise<StorageResult<StorageReport>> {
	if (!storage?.estimate) {
		return failure('unsupported-browser', 'This browser cannot report storage usage.');
	}

	try {
		const estimate = await storage.estimate();
		const usageBytes = nonNegativeFinite(estimate.usage);
		const quotaBytes = nonNegativeFinite(estimate.quota);

		return success({
			usageBytes,
			quotaBytes,
			availableBytes: Math.max(0, quotaBytes - usageBytes),
			usageRatio: quotaBytes > 0 ? usageBytes / quotaBytes : null
		});
	} catch (error: unknown) {
		return storageFailure('Could not estimate browser storage', error);
	}
};
