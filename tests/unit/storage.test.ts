import { describe, expect, test } from 'bun:test';
import {
	estimateStorage,
	requestPersistentStorage,
	type StorageAdapter
} from '../../src/persistence/storage.ts';

describe('browser storage diagnostics', () => {
	test('requests persistence and reports available quota', async () => {
		const storage: StorageAdapter = {
			persist: async () => true,
			estimate: async () => ({ usage: 250, quota: 1000 })
		};

		expect(await requestPersistentStorage(storage)).toEqual({ ok: true, value: true });
		expect(await estimateStorage(storage)).toEqual({
			ok: true,
			value: {
				usageBytes: 250,
				quotaBytes: 1000,
				availableBytes: 750,
				usageRatio: 0.25
			}
		});
	});

	test('reports unsupported and failed storage capabilities', async () => {
		expect(await requestPersistentStorage({})).toEqual({ ok: true, value: false });
		expect(await estimateStorage({})).toMatchObject({ ok: false, error: { code: 'unsupported-browser' } });

		const failingStorage: StorageAdapter = {
			persist: async () => {
				throw new Error('permission denied');
			},
			estimate: async () => {
				throw new Error('estimate denied');
			}
		};

		expect(await requestPersistentStorage(failingStorage)).toMatchObject({ ok: false, error: { code: 'storage-failure' } });
		expect(await estimateStorage(failingStorage)).toMatchObject({ ok: false, error: { code: 'storage-failure' } });
	});
});
