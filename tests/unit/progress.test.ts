import { describe, expect, test } from 'bun:test';
import { runExportBatches, type ExportProgress } from '../../src/export/progress.ts';

describe('export batching and progress', () => {
	test('processes items in bounded batches and yields between them', async () => {
		const progress: ExportProgress[] = [];
		const yields: number[] = [];
		const result = await runExportBatches([1, 2, 3, 4, 5], async (item, index) => item + index, {
			batchSize: 2,
			onProgress: (value) => progress.push(value),
			yieldControl: async () => {
				yields.push(1);
			}
		});

		expect(result).toEqual({ ok: true, value: [1, 3, 5, 7, 9] });
		expect(progress).toEqual([
			{ completed: 2, total: 5 },
			{ completed: 4, total: 5 },
			{ completed: 5, total: 5 }
		]);
		expect(yields).toHaveLength(2);
	});

	test('stops at an abort boundary and normalizes failures', async () => {
		const controller = new AbortController();
		const processed: number[] = [];
		const cancelledResult = await runExportBatches([1, 2, 3], async (item) => {
			processed.push(item);
			controller.abort();
			return item;
		}, { batchSize: 1, signal: controller.signal, yieldControl: async () => undefined });
		const failedResult = await runExportBatches([1], async () => {
			throw new Error('render failed');
		}, { batchSize: 1 });

		expect(cancelledResult).toMatchObject({ ok: false, code: 'cancelled' });
		expect(processed).toEqual([1]);
		expect(failedResult).toEqual({ ok: false, code: 'failed', error: 'render failed' });
	});

	test('rejects invalid batch sizes', async () => {
		expect(await runExportBatches([], async (item: number) => item, { batchSize: 0 })).toMatchObject({ ok: false, code: 'failed' });
	});
});
