export type ExportProgress = Readonly<{
	completed: number;
	total: number;
}>;

export type ExportBatchOptions = Readonly<{
	batchSize: number;
	signal?: AbortSignal;
	onProgress?: (progress: ExportProgress) => void;
	yieldControl?: () => Promise<void>;
}>;

export type ExportRunResult<TValue> =
	| Readonly<{ ok: true; value: readonly TValue[] }>
	| Readonly<{ ok: false; code: 'cancelled' | 'failed'; error: string }>;

const defaultYieldControl = function defaultYieldControl(): Promise<void> {
	return new Promise((resolve) => {
		if (typeof requestAnimationFrame === 'function') {
			requestAnimationFrame(() => resolve());
			return;
		}

		setTimeout(resolve, 0);
	});
};

const noProgress = function noProgress(): void {};

const cancelled = function cancelled(): ExportRunResult<never> {
	return { ok: false, code: 'cancelled', error: 'Export was cancelled.' };
};

const failed = function failed(error: unknown): ExportRunResult<never> {
	return {
		ok: false,
		code: 'failed',
		error: error instanceof Error ? error.message : 'Export batch failed.'
	};
};

export const runExportBatches = async function runExportBatches<TInput, TValue>(
	items: readonly TInput[],
	processItem: (item: TInput, index: number) => Promise<TValue>,
	options: ExportBatchOptions
): Promise<ExportRunResult<TValue>> {
	if (!Number.isInteger(options.batchSize) || options.batchSize < 1) {
		return failed('Export batch size must be a positive integer.');
	}

	const yieldControl = options.yieldControl ?? defaultYieldControl;
	const onProgress = options.onProgress ?? noProgress;

	const runBatch = async function runBatch(
		offset: number,
		results: readonly TValue[]
	): Promise<ExportRunResult<TValue>> {
		if (options.signal?.aborted) {
			return cancelled();
		}
		if (offset >= items.length) {
			onProgress({ completed: results.length, total: items.length });
			return { ok: true, value: results };
		}

		const batch = items.slice(offset, offset + options.batchSize);

		try {
			const batchResults = await Promise.all(batch.map((item, index) => processItem(item, offset + index)));
			const nextResults = [...results, ...batchResults];

			onProgress({ completed: nextResults.length, total: items.length });

			if (offset + batch.length >= items.length) {
				return { ok: true, value: nextResults };
			}

			await yieldControl();
			return runBatch(offset + batch.length, nextResults);
		} catch (error: unknown) {
			return failed(error);
		}
	};

	return runBatch(0, []);
};
